import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import {
  Loader2, ArrowLeft, ArrowRight, RefreshCw, Search, FileText,
  Edit, Sparkles, CheckCircle2, Play, Film
} from 'lucide-react';

export default function ContentRepurpose() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: URL input
  const [videoUrl, setVideoUrl] = useState('');

  // Step 2: Analysis
  const [analysis, setAnalysis] = useState(null);

  // Step 3: User tweaks
  const [newTitle, setNewTitle] = useState('');
  const [tweakNotes, setTweakNotes] = useState('');

  // Step 4: New script
  const [newScript, setNewScript] = useState('');

  const handleAnalyze = async () => {
    setLoading(true);

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a YouTube content analyst. Analyze this YouTube video URL and extract a complete breakdown.

VIDEO URL: ${videoUrl}

Analyze the video and return a detailed breakdown:
1. Video title
2. Estimated video length (seconds)
3. Content niche/category
4. Script style (e.g. conversational, dramatic narrator, educational, investigative)
5. Voiceover style (e.g. deep dramatic male, energetic female, calm narrator)
6. Visual style (cinematic, documentary, animation, stock footage mix)
7. Pacing (fast-cut, medium, slow cinematic)
8. Hook technique used in first 10 seconds
9. Content structure (how the video is organized — intro, sections, conclusion)
10. Key topics covered
11. Estimated word count / script length
12. A complete reconstructed script outline (what the narrator would say, section by section)

Be as detailed as possible about the video's approach so it can be recreated.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          estimated_duration_seconds: { type: "number" },
          niche: { type: "string" },
          script_style: { type: "string" },
          voiceover_style: { type: "string" },
          visual_style: { type: "string" },
          pacing: { type: "string" },
          hook_technique: { type: "string" },
          content_structure: { type: "string" },
          key_topics: { type: "array", items: { type: "string" } },
          estimated_word_count: { type: "number" },
          reconstructed_outline: { type: "string" },
          tone_description: { type: "string" },
        }
      }
    });

    setAnalysis(result);
    setNewTitle(result.title || '');
    setLoading(false);
    setStep(2);
  };

  const handleGenerateNewScript = async () => {
    setLoading(true);

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a professional YouTube scriptwriter. Based on the analysis of an existing high-performing video, write a NEW script in the SAME style but with the user's modifications.

ORIGINAL VIDEO ANALYSIS:
- Title: ${analysis.title}
- Niche: ${analysis.niche}
- Script Style: ${analysis.script_style}
- Voiceover Style: ${analysis.voiceover_style}
- Pacing: ${analysis.pacing}
- Hook Technique: ${analysis.hook_technique}
- Content Structure: ${analysis.content_structure}
- Tone: ${analysis.tone_description}
- Estimated Duration: ${analysis.estimated_duration_seconds}s
- Original Outline: ${analysis.reconstructed_outline}

USER'S MODIFICATIONS:
- New Title: ${newTitle}
- Additional Notes: ${tweakNotes || 'None — keep as close to original style as possible'}

Write a complete narration script that:
1. Matches the EXACT style, tone, and pacing of the original
2. Uses the same hook technique
3. Follows the same content structure
4. Incorporates the user's title change and any noted modifications
5. Is approximately ${analysis.estimated_word_count || 1500} words
6. Includes [SCENE BREAK] markers between major sections

Return ONLY the script text with [SCENE BREAK] markers.`,
    });

    setNewScript(result);
    setLoading(false);
    setStep(4);
  };

  const handleCreateProject = async () => {
    setLoading(true);

    // Create the project
    const project = await base44.entities.Projects.create({
      name: newTitle || analysis.title,
      niche: analysis.niche,
      tone: analysis.script_style,
      visual_style: analysis.visual_style?.includes('anime') ? 'cinematic_anime' :
                     analysis.visual_style?.includes('cartoon') ? 'cartoon_2d' : 'cinematic_realistic',
      orientation: 'landscape',
      video_duration_minutes: Math.ceil((analysis.estimated_duration_seconds || 600) / 60),
      status: 'script_complete',
      current_step: 4,
    });

    // Create the script
    await base44.entities.Scripts.create({
      project_id: project.id,
      version: 'final_aggregated',
      title: newTitle || analysis.title,
      full_script: newScript,
      word_count: newScript.split(/\s+/).filter(w => w).length,
      estimated_duration_sec: analysis.estimated_duration_seconds || 600,
    });

    navigate(createPageUrl(`ContentGeneration?project_id=${project.id}`));
  };

  const stepLabels = ['Video URL', 'Analysis', 'Customize', 'New Script'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
      <div className="max-w-3xl mx-auto py-8">
        <Button variant="ghost" onClick={() => navigate(createPageUrl('NewProject'))} className="gap-2 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto shadow-lg mb-4">
            <RefreshCw className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">Content Repurpose</h1>
          <p className="text-gray-500 mt-1">Analyze a YouTube video and recreate it with your twist</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {stepLabels.map((label, i) => (
            <React.Fragment key={i}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                step > i + 1 ? 'bg-green-100 text-green-700' :
                step === i + 1 ? 'bg-emerald-100 text-emerald-700' :
                'bg-gray-100 text-gray-400'
              }`}>
                {step > i + 1 ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </div>
              {i < stepLabels.length - 1 && <div className={`w-6 h-0.5 ${step > i + 1 ? 'bg-green-300' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: URL */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="w-5 h-5 text-emerald-600" />
                Enter YouTube Video URL
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                className="text-lg py-6"
              />
              <p className="text-xs text-gray-500">
                Paste the URL of a high-performing YouTube video you want to repurpose.
                AI will analyze its style, structure, and approach.
              </p>
              <Button
                onClick={handleAnalyze}
                disabled={!videoUrl.trim() || loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
                size="lg"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                {loading ? 'Analyzing Video...' : 'Analyze Video'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Analysis Results */}
        {step === 2 && analysis && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                Video Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <h3 className="font-semibold text-lg">{analysis.title}</h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline">{analysis.niche}</Badge>
                  <Badge variant="outline">{Math.ceil((analysis.estimated_duration_seconds || 600) / 60)} min</Badge>
                  <Badge variant="outline">{analysis.pacing} pacing</Badge>
                  <Badge variant="outline">{analysis.estimated_word_count || '~1500'} words</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white p-3 rounded border">
                  <p className="text-gray-500 text-xs mb-1">Script Style</p>
                  <p className="font-medium">{analysis.script_style}</p>
                </div>
                <div className="bg-white p-3 rounded border">
                  <p className="text-gray-500 text-xs mb-1">Voiceover Style</p>
                  <p className="font-medium">{analysis.voiceover_style}</p>
                </div>
                <div className="bg-white p-3 rounded border">
                  <p className="text-gray-500 text-xs mb-1">Visual Style</p>
                  <p className="font-medium">{analysis.visual_style}</p>
                </div>
                <div className="bg-white p-3 rounded border">
                  <p className="text-gray-500 text-xs mb-1">Hook Technique</p>
                  <p className="font-medium">{analysis.hook_technique}</p>
                </div>
              </div>

              <div className="bg-white p-3 rounded border">
                <p className="text-gray-500 text-xs mb-1">Content Structure</p>
                <p className="text-sm">{analysis.content_structure}</p>
              </div>

              {analysis.key_topics?.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs mb-1">Key Topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.key_topics.map((topic, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{topic}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {analysis.reconstructed_outline && (
                <div className="bg-white p-3 rounded border max-h-[200px] overflow-y-auto">
                  <p className="text-gray-500 text-xs mb-1">Reconstructed Outline</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{analysis.reconstructed_outline}</p>
                </div>
              )}

              <Button
                onClick={() => setStep(3)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
              >
                Customize & Recreate <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Customize */}
        {step === 3 && analysis && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Edit className="w-5 h-5 text-emerald-600" />
                Customize Your Version
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">New Title</label>
                <Input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Your new video title..."
                />
                <p className="text-xs text-gray-400 mt-1">Original: {analysis.title}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">What would you like to change?</label>
                <Textarea
                  value={tweakNotes}
                  onChange={e => setTweakNotes(e.target.value)}
                  placeholder="e.g. Focus more on the financial impact, add a personal story angle, make it more dramatic..."
                  className="min-h-[120px]"
                />
                <p className="text-xs text-gray-400 mt-1">Leave empty to keep the same style as the original</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button
                  onClick={handleGenerateNewScript}
                  disabled={loading || !newTitle.trim()}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {loading ? 'Generating Script...' : 'Generate New Script'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: New Script + Create Project */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Film className="w-5 h-5 text-emerald-600" />
                Your New Script
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-emerald-100 text-emerald-800">{newTitle}</Badge>
                <Badge variant="outline">{newScript.split(/\s+/).filter(w => w).length} words</Badge>
              </div>
              <Textarea
                value={newScript}
                onChange={e => setNewScript(e.target.value)}
                className="min-h-[400px] text-sm font-mono"
              />
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(3)} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button
                  onClick={handleCreateProject}
                  disabled={loading || !newScript.trim()}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2"
                  size="lg"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                  {loading ? 'Creating Project...' : 'Create Project & Start Pipeline'}
                </Button>
              </div>
              <p className="text-xs text-gray-400 text-center">
                This will create a project with the script and take you to the content generation pipeline
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}