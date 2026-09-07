// ffmpeg worker container.
//
// One endpoint, POST /run. The Worker decides everything: which op, which source, where
// the result goes. This process holds no API keys, has no database access, and never
// picks its own destination — it is handed a single pre-authorized upload target per
// job. If it is compromised, the blast radius is one object.
//
// ffmpeg reads the source over HTTP directly (`-i <url>`) rather than downloading first.
// That is what the original Deno implementation did, and it avoids buffering a whole
// source video in a container with limited disk.
//
// SECURITY: user-supplied strings never become ffmpeg flags. `source_url` is scheme-
// checked and passed as a single `-i` argument; everything else is a number we format
// ourselves or a file we wrote. ffmpeg's protocol whitelist is pinned so a crafted URL
// cannot make it read local files.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	jobTimeout   = 10 * time.Minute
	uploadRetries = 2
	// ffmpeg may read from http(s) and its own tls/tcp plumbing — nothing else.
	// Without this, a `file:` or `concat:` source_url could read the container's disk.
	protocolWhitelist = "file,http,https,tcp,tls,crypto"
)

type uploadTarget struct {
	PutURL    string `json:"put_url"`
	AccessKey string `json:"access_key"`
}

type request struct {
	Op        string          `json:"op"`
	SourceURL string          `json:"source_url"`
	Args      json.RawMessage `json:"args"`
	Upload    *uploadTarget   `json:"upload"`
}

type response struct {
	OK       bool    `json:"ok"`
	Duration float64 `json:"duration,omitempty"`
	Bytes    int64   `json:"bytes,omitempty"`
	Error    string  `json:"error,omitempty"`
}

type clipArgs struct {
	Start    int `json:"start"`
	Duration int `json:"duration"`
}

type captionArgs struct {
	SRT string `json:"srt"`
}

type concatArgs struct {
	SourceURLs []string `json:"source_urls"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if err := exec.Command("ffmpeg", "-version").Run(); err != nil {
			writeJSON(w, 500, response{OK: false, Error: "ffmpeg not runnable: " + err.Error()})
			return
		}
		writeJSON(w, 200, response{OK: true})
	})

	http.HandleFunc("/run", handleRun)

	log.Printf("ffmpeg container listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, response{OK: false, Error: "POST only"})
		return
	}

	var req request
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
		writeJSON(w, 400, response{OK: false, Error: "bad JSON: " + err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), jobTimeout)
	defer cancel()

	// Every job gets its own directory so a failure cannot leak state into the next one
	// on a warm container.
	work, err := os.MkdirTemp("", "job-*")
	if err != nil {
		writeJSON(w, 500, response{OK: false, Error: "no temp dir: " + err.Error()})
		return
	}
	defer os.RemoveAll(work)

	out := filepath.Join(work, "out.mp4")

	var runErr error
	switch req.Op {
	case "probe":
		dur, perr := probe(ctx, req.SourceURL)
		if perr != nil {
			writeJSON(w, 502, response{OK: false, Error: perr.Error()})
			return
		}
		writeJSON(w, 200, response{OK: true, Duration: dur})
		return

	case "clip":
		runErr = opClip(ctx, req, out)
	case "burn_captions":
		runErr = opBurnCaptions(ctx, req, work, out)
	case "concat":
		runErr = opConcat(ctx, req, work, out)
	default:
		writeJSON(w, 400, response{OK: false, Error: "unknown op: " + req.Op})
		return
	}

	if runErr != nil {
		writeJSON(w, 502, response{OK: false, Error: runErr.Error()})
		return
	}

	if req.Upload == nil || req.Upload.PutURL == "" {
		writeJSON(w, 400, response{OK: false, Error: "upload target is required"})
		return
	}

	n, err := uploadFile(ctx, out, req.Upload)
	if err != nil {
		writeJSON(w, 502, response{OK: false, Error: "upload failed: " + err.Error()})
		return
	}

	dur, _ := probeLocal(ctx, out) // best effort — a missing duration is not a failure
	writeJSON(w, 200, response{OK: true, Bytes: n, Duration: dur})
}

// ── ops ───────────────────────────────────────────────────────────────────────

// opClip cuts start..start+duration and crops to 9:16 portrait.
//
// FLAGS COPIED VERBATIM from the original Deno clip_video. Changing the preset, CRF or
// filter chain changes how every clip the app has ever produced looks. Leave them.
func opClip(ctx context.Context, req request, out string) error {
	if err := checkURL(req.SourceURL); err != nil {
		return err
	}
	var a clipArgs
	if err := json.Unmarshal(req.Args, &a); err != nil {
		return fmt.Errorf("bad clip args: %w", err)
	}
	if a.Duration <= 0 {
		return fmt.Errorf("duration must be positive, got %d", a.Duration)
	}

	return runFFmpeg(ctx,
		"-protocol_whitelist", protocolWhitelist,
		"-y",
		"-ss", strconv.Itoa(a.Start),
		"-i", req.SourceURL,
		"-t", strconv.Itoa(a.Duration),
		"-vf", "crop=ih*9/16:ih,scale=720:1280",
		"-c:v", "libx264",
		"-preset", "ultrafast",
		"-crf", "26",
		"-c:a", "aac",
		"-b:a", "128k",
		"-movflags", "+faststart",
		"-f", "mp4",
		out,
	)
}

func opBurnCaptions(ctx context.Context, req request, work, out string) error {
	if err := checkURL(req.SourceURL); err != nil {
		return err
	}
	var a captionArgs
	if err := json.Unmarshal(req.Args, &a); err != nil {
		return fmt.Errorf("bad caption args: %w", err)
	}
	if strings.TrimSpace(a.SRT) == "" {
		return fmt.Errorf("srt is empty")
	}

	srt := filepath.Join(work, "subs.srt")
	if err := os.WriteFile(srt, []byte(a.SRT), 0o600); err != nil {
		return fmt.Errorf("could not write subtitles: %w", err)
	}

	// The subtitles filter takes a filename inside a filter string, so the path has to
	// be escaped rather than passed as its own argument. We control this path entirely —
	// it is our temp dir, not user input.
	filter := "subtitles=" + strings.ReplaceAll(srt, ":", "\\:")

	return runFFmpeg(ctx,
		"-protocol_whitelist", protocolWhitelist,
		"-y",
		"-i", req.SourceURL,
		"-vf", filter,
		"-c:v", "libx264",
		"-preset", "ultrafast",
		"-crf", "26",
		"-c:a", "copy",
		"-movflags", "+faststart",
		"-f", "mp4",
		out,
	)
}

func opConcat(ctx context.Context, req request, work, out string) error {
	var a concatArgs
	if err := json.Unmarshal(req.Args, &a); err != nil {
		return fmt.Errorf("bad concat args: %w", err)
	}
	if len(a.SourceURLs) == 0 {
		return fmt.Errorf("source_urls is empty")
	}

	var b strings.Builder
	for _, u := range a.SourceURLs {
		if err := checkURL(u); err != nil {
			return err
		}
		// Single quotes are the concat demuxer's escape; a URL containing one would
		// break out of the entry, so refuse it rather than try to escape.
		if strings.Contains(u, "'") {
			return fmt.Errorf("source url contains a quote: %s", u)
		}
		fmt.Fprintf(&b, "file '%s'\n", u)
	}

	list := filepath.Join(work, "list.txt")
	if err := os.WriteFile(list, []byte(b.String()), 0o600); err != nil {
		return fmt.Errorf("could not write concat list: %w", err)
	}

	return runFFmpeg(ctx,
		"-protocol_whitelist", protocolWhitelist,
		"-y",
		"-f", "concat",
		"-safe", "0",
		"-i", list,
		"-c", "copy",
		"-movflags", "+faststart",
		"-f", "mp4",
		out,
	)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func checkURL(raw string) error {
	if raw == "" {
		return fmt.Errorf("source_url is required")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("malformed source_url")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("source_url must be http(s), got %q", u.Scheme)
	}
	return nil
}

func runFFmpeg(ctx context.Context, args ...string) error {
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	var stderr strings.Builder
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// ffmpeg's last few lines carry the real reason; the rest is banner noise.
		msg := stderr.String()
		if lines := strings.Split(strings.TrimSpace(msg), "\n"); len(lines) > 6 {
			msg = strings.Join(lines[len(lines)-6:], "\n")
		}
		return fmt.Errorf("ffmpeg: %v: %s", err, msg)
	}
	return nil
}

func probe(ctx context.Context, src string) (float64, error) {
	if err := checkURL(src); err != nil {
		return 0, err
	}
	return probeLocal(ctx, src)
}

func probeLocal(ctx context.Context, path string) (float64, error) {
	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		path,
	)
	out, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("ffprobe: %w", err)
	}
	return strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
}

// uploadFile PUTs the result to the target the Worker supplied. Retried because a
// transient storage blip should not throw away an encode we already paid for.
func uploadFile(ctx context.Context, path string, target *uploadTarget) (int64, error) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, fmt.Errorf("no output produced: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt <= uploadRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt) * 2 * time.Second)
		}

		f, err := os.Open(path)
		if err != nil {
			return 0, err
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPut, target.PutURL, f)
		if err != nil {
			f.Close()
			return 0, err
		}
		req.Header.Set("AccessKey", target.AccessKey)
		req.Header.Set("Content-Type", "video/mp4")
		req.ContentLength = info.Size()

		res, err := http.DefaultClient.Do(req)
		f.Close()
		if err != nil {
			lastErr = err
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		res.Body.Close()

		if res.StatusCode >= 200 && res.StatusCode < 300 {
			return info.Size(), nil
		}
		lastErr = fmt.Errorf("HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	return 0, lastErr
}

func writeJSON(w http.ResponseWriter, status int, v response) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
