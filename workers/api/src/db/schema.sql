-- myytengine D1 schema. GENERATED - see MIGRATION-PLAN.md C-3.
-- Every table: typed declared columns + `attrs` JSON overflow (the original platform was schemaless).
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS AssetPlans (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  ai_visual_percent            REAL,
  archival_percent             REAL,
  full_response                TEXT,
  project_id                   TEXT,
  recommended_sources          TEXT,
  stock_broll_percent          REAL,
  text_animation_percent       REAL,
  transition_rules             TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_AssetPlans_created ON AssetPlans(created_date DESC);

CREATE TABLE IF NOT EXISTS BrandIdentities (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  channel_name                 TEXT,
  color_accent                 TEXT,
  color_primary                TEXT,
  color_secondary              TEXT,
  full_response                TEXT,
  intro_concept                TEXT,
  logo_direction               TEXT,
  niche                        TEXT,
  outro_concept                TEXT,
  project_id                   TEXT,
  sound_identity               TEXT,
  tagline                      TEXT,
  thumbnail_tone               TEXT,
  typography_body              TEXT,
  typography_heading           TEXT,
  visual_rules                 TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_BrandIdentities_created ON BrandIdentities(created_date DESC);

CREATE TABLE IF NOT EXISTS CalendarEntries (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  content_theme                TEXT,
  day_of_week                  TEXT,
  engagement_action            TEXT,
  format                       TEXT,
  project_id                   TEXT,
  reuse_assets                 TEXT,
  status                       TEXT,
  topic_title                  TEXT,
  week_number                  REAL,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_CalendarEntries_created ON CalendarEntries(created_date DESC);

CREATE TABLE IF NOT EXISTS ChannelThumbnailDNA (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  background_color             TEXT,
  banned_templates             TEXT,
  channel_id                   TEXT,
  composition_style            TEXT,
  emotion_bias                 TEXT,
  face_descriptions            TEXT,
  face_reference_urls          TEXT,
  font_family                  TEXT,
  is_active                    INTEGER,
  logo_url                     TEXT,
  mood_bias                    TEXT,
  preferred_templates          TEXT,
  primary_color                TEXT,
  secondary_color              TEXT,
  style_notes                  TEXT,
  text_color                   TEXT,
  text_style_preset            TEXT,
  visual_style_lock            TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ChannelThumbnailDNA_created ON ChannelThumbnailDNA(created_date DESC);

CREATE TABLE IF NOT EXISTS ChannelTopics (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  ai_notes                     TEXT,
  channel_id                   TEXT,
  format                       TEXT,
  notes                        TEXT,
  priority                     REAL,
  project_id                   TEXT,
  scheduled_date               TEXT,
  scheduled_time               TEXT,
  scheduled_timezone           TEXT,
  slot_index                   REAL,
  status                       TEXT,
  suggested_post_time          TEXT,
  theme_cluster                TEXT,
  title                        TEXT,
  trend_score                  REAL,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ChannelTopics_channel_id ON ChannelTopics(channel_id);
CREATE INDEX IF NOT EXISTS idx_ChannelTopics_created ON ChannelTopics(created_date DESC);

CREATE TABLE IF NOT EXISTS Channels (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  ai_insights                  TEXT,
  color                        TEXT,
  description                  TEXT,
  icon_emoji                   TEXT,
  last_trend_refresh           TEXT,
  long_form_duration_minutes   REAL,
  longform_per_week            REAL,
  name                         TEXT,
  niche                        TEXT,
  niche_label                  TEXT,
  script_mode                  TEXT,
  script_strategy              TEXT,
  short_form_word_limit        REAL,
  shorts_niche                 TEXT,
  shorts_per_day               REAL,
  status                       TEXT,
  tone                         TEXT,
  topics_scheduled             REAL,
  total_topics                 REAL,
  visual_style                 TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_Channels_status ON Channels(status);
CREATE INDEX IF NOT EXISTS idx_Channels_created ON Channels(created_date DESC);

CREATE TABLE IF NOT EXISTS Hooks (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  hook_text                    TEXT,
  hook_type                    TEXT,
  intensity_score              REAL,
  is_selected                  INTEGER,
  project_id                   TEXT,
  rank                         REAL,
  topic_id                     TEXT,
  use_as_thumbnail             INTEGER,
  use_as_voiceover             INTEGER,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_Hooks_project_id ON Hooks(project_id);
CREATE INDEX IF NOT EXISTS idx_Hooks_created ON Hooks(created_date DESC);

CREATE TABLE IF NOT EXISTS MediaAssets (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  category                     TEXT,
  file_size_bytes              REAL,
  file_type                    TEXT,
  file_url                     TEXT,
  filename                     TEXT,
  project_id                   TEXT,
  tags                         TEXT,
  used_in_scenes               TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_MediaAssets_category ON MediaAssets(category);
CREATE INDEX IF NOT EXISTS idx_MediaAssets_file_type ON MediaAssets(file_type);
CREATE INDEX IF NOT EXISTS idx_MediaAssets_project_id ON MediaAssets(project_id);
CREATE INDEX IF NOT EXISTS idx_MediaAssets_created ON MediaAssets(created_date DESC);

CREATE TABLE IF NOT EXISTS MusicTracks (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  audio_url                    TEXT,
  duration_seconds             REAL,
  genre                        TEXT,
  is_selected                  INTEGER,
  mood                         TEXT,
  project_id                   TEXT,
  prompt                       TEXT,
  status                       TEXT,
  title                        TEXT,
  volume                       REAL,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_MusicTracks_project_id ON MusicTracks(project_id);
CREATE INDEX IF NOT EXISTS idx_MusicTracks_created ON MusicTracks(created_date DESC);

CREATE TABLE IF NOT EXISTS ProductionSettings (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  beat_durations               TEXT,
  beat_start_times             TEXT,
  caption_animation            TEXT,
  caption_bg_color             TEXT,
  caption_data                 TEXT,
  caption_enabled              INTEGER,
  caption_font_size            REAL,
  caption_highlight_color      TEXT,
  caption_max_words            REAL,
  caption_position             TEXT,
  caption_stroke_width         REAL,
  caption_style_preset         TEXT,
  caption_text_color           TEXT,
  generation_task_id           TEXT,
  project_id                   TEXT,
  selected_asset_style         TEXT,
  selected_voice_id            TEXT,
  story_analysis               TEXT,
  timeline_caption_clips       TEXT,
  timeline_overlay_clips       TEXT,
  timeline_video_clips         TEXT,
  total_duration_seconds       REAL,
  voiceover_chunks             TEXT,
  voiceover_completed_chunks   REAL,
  voiceover_status             TEXT,
  voiceover_total_chunks       REAL,
  voiceover_url                TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ProductionSettings_project_id ON ProductionSettings(project_id);
CREATE INDEX IF NOT EXISTS idx_ProductionSettings_created ON ProductionSettings(created_date DESC);

CREATE TABLE IF NOT EXISTS Projects (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  archived                     INTEGER,
  channel_id                   TEXT,
  channel_topic_id             TEXT,
  character_descriptions       TEXT,
  current_step                 REAL,
  explainer_arc                TEXT,
  image_provider               TEXT,
  name                         TEXT,
  niche                        TEXT,
  orientation                  TEXT,
  outline                      TEXT,
  project_mode                 TEXT,
  reference_image_url          TEXT,
  research_notes               TEXT,
  script_id                    TEXT,
  script_strategy_override     TEXT,
  selected_hook_id             TEXT,
  selected_topic_id            TEXT,
  status                       TEXT,
  storytelling_format          TEXT,
  target_audience              TEXT,
  tone                         TEXT,
  video_duration_minutes       REAL,
  visual_style                 TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_Projects_created ON Projects(created_date DESC);

CREATE TABLE IF NOT EXISTS RetentionMaps (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  audio_intensity              TEXT,
  checkpoint_name              TEXT,
  description                  TEXT,
  order_index                  REAL,
  project_id                   TEXT,
  retention_strategy           TEXT,
  script_id                    TEXT,
  time_end                     TEXT,
  time_start                   TEXT,
  visual_intensity             TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_RetentionMaps_created ON RetentionMaps(created_date DESC);

CREATE TABLE IF NOT EXISTS Scenes (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  act                          TEXT,
  animation_prompt             TEXT,
  animation_speed              TEXT,
  broll_id                     TEXT,
  broll_query                  TEXT,
  broll_source                 TEXT,
  broll_thumbnail              TEXT,
  broll_url                    TEXT,
  camera_movement              TEXT,
  duration_seconds             REAL,
  image_prompt                 TEXT,
  image_url                    TEXT,
  narration_text               TEXT,
  notes                        TEXT,
  project_id                   TEXT,
  scene_number                 REAL,
  sfx_volume                   REAL,
  sound_effect                 TEXT,
  sound_effect_url             TEXT,
  status                       TEXT,
  transition_duration          REAL,
  transition_type              TEXT,
  video_url                    TEXT,
  visual_effects               TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_Scenes_project_id ON Scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_Scenes_created ON Scenes(created_date DESC);

CREATE TABLE IF NOT EXISTS ScriptBatches (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  batch_number                 REAL,
  content                      TEXT,
  focus_area                   TEXT,
  project_id                   TEXT,
  scene_image_url              TEXT,
  script_id                    TEXT,
  status                       TEXT,
  story_segment                TEXT,
  synopsis                     TEXT,
  target_words                 REAL,
  word_count                   REAL,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ScriptBatches_project_id ON ScriptBatches(project_id);
CREATE INDEX IF NOT EXISTS idx_ScriptBatches_created ON ScriptBatches(created_date DESC);

CREATE TABLE IF NOT EXISTS Scripts (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  act_1                        TEXT,
  act_2                        TEXT,
  act_3                        TEXT,
  cold_open                    TEXT,
  editor_notes                 TEXT,
  estimated_duration_sec       REAL,
  full_script                  TEXT,
  outro                        TEXT,
  project_id                   TEXT,
  title                        TEXT,
  topic_id                     TEXT,
  version                      TEXT,
  word_count                   REAL,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_Scripts_project_id ON Scripts(project_id);
CREATE INDEX IF NOT EXISTS idx_Scripts_created ON Scripts(created_date DESC);

CREATE TABLE IF NOT EXISTS ThumbnailConcepts (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  color_scheme                 TEXT,
  concept_description          TEXT,
  ctr_score                    REAL,
  facial_expression            TEXT,
  image_prompt                 TEXT,
  image_url                    TEXT,
  is_selected                  INTEGER,
  project_id                   TEXT,
  rank                         REAL,
  style_reference              TEXT,
  text_overlay                 TEXT,
  visual_metaphor              TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ThumbnailConcepts_project_id ON ThumbnailConcepts(project_id);
CREATE INDEX IF NOT EXISTS idx_ThumbnailConcepts_created ON ThumbnailConcepts(created_date DESC);

CREATE TABLE IF NOT EXISTS ThumbnailNiches (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  description                  TEXT,
  icon                         TEXT,
  last_synthesized             TEXT,
  name                         TEXT,
  synthesized_dna              TEXT,
  template_count               REAL,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ThumbnailNiches_created ON ThumbnailNiches(created_date DESC);

CREATE TABLE IF NOT EXISTS ThumbnailTemplates (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  character_action_notes       TEXT,
  color_strategy               TEXT,
  composition_blueprint        TEXT,
  emotional_tone               TEXT,
  forensic_description         TEXT,
  is_favorite                  INTEGER,
  niche_id                     TEXT,
  niche_tags                   TEXT,
  quality_score                REAL,
  recreate_prompt              TEXT,
  source_url                   TEXT,
  template_type                TEXT,
  text_strategy                TEXT,
  thumbnail_image_url          TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ThumbnailTemplates_created ON ThumbnailTemplates(created_date DESC);

CREATE TABLE IF NOT EXISTS TimelineBlocks (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  asset_style                  TEXT,
  background_removal_enabled   INTEGER,
  background_removal_url       TEXT,
  block_type                   TEXT,
  broll_id                     TEXT,
  broll_source                 TEXT,
  broll_url                    TEXT,
  color_grade                  TEXT,
  crop_settings                TEXT,
  duration_seconds             REAL,
  generated_asset_url          TEXT,
  generation_task_id           TEXT,
  keyframes                    TEXT,
  order_index                  REAL,
  project_id                   TEXT,
  prompt                       TEXT,
  start_time_seconds           REAL,
  status                       TEXT,
  transition_duration          REAL,
  transition_type              TEXT,
  volume                       REAL,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_TimelineBlocks_created ON TimelineBlocks(created_date DESC);

CREATE TABLE IF NOT EXISTS TimingEntries (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  duration_seconds             REAL,
  entry_order                  REAL,
  project_id                   TEXT,
  scene_concept                TEXT,
  script_id                    TEXT,
  spoken_text                  TEXT,
  timestamp_end                TEXT,
  timestamp_start              TEXT,
  transition_type              TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_TimingEntries_created ON TimingEntries(created_date DESC);

CREATE TABLE IF NOT EXISTS Topics (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  description                  TEXT,
  emotional_score              REAL,
  engagement_notes             TEXT,
  is_selected                  INTEGER,
  keyword_potential            TEXT,
  monthly_searches             TEXT,
  project_id                   TEXT,
  rank                         REAL,
  storytelling_score           REAL,
  title                        TEXT,
  viral_score                  REAL,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_Topics_project_id ON Topics(project_id);
CREATE INDEX IF NOT EXISTS idx_Topics_created ON Topics(created_date DESC);

CREATE TABLE IF NOT EXISTS Transcripts (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  full_text                    TEXT,
  project_id                   TEXT,
  status                       TEXT,
  total_words                  REAL,
  word_timings                 TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_Transcripts_created ON Transcripts(created_date DESC);

CREATE TABLE IF NOT EXISTS UploadMetadata (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  description_alt_1            TEXT,
  description_alt_2            TEXT,
  description_template         TEXT,
  descriptions_json            TEXT,
  hashtags                     TEXT,
  pinned_comment               TEXT,
  project_id                   TEXT,
  record_type                  TEXT,
  selected_channel_id          TEXT,
  seo_analysis                 TEXT,
  seo_strategy                 TEXT,
  status                       TEXT,
  tags                         TEXT,
  tags_long                    TEXT,
  tags_medium                  TEXT,
  tags_short                   TEXT,
  title_primary                TEXT,
  title_variation_1            TEXT,
  title_variation_2            TEXT,
  title_variation_3            TEXT,
  title_variation_4            TEXT,
  titles_json                  TEXT,
  youtube_channels             TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_UploadMetadata_project_id ON UploadMetadata(project_id);
CREATE INDEX IF NOT EXISTS idx_UploadMetadata_record_type ON UploadMetadata(record_type);
CREATE INDEX IF NOT EXISTS idx_UploadMetadata_status ON UploadMetadata(status);
CREATE INDEX IF NOT EXISTS idx_UploadMetadata_created ON UploadMetadata(created_date DESC);

CREATE TABLE IF NOT EXISTS VisualPrompts (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  camera_angle                 TEXT,
  character_actions            TEXT,
  composition_notes            TEXT,
  duration_seconds             REAL,
  emotional_tone               TEXT,
  lighting                     TEXT,
  narration_text               TEXT,
  project_id                   TEXT,
  scene_environment            TEXT,
  scene_number                 REAL,
  script_id                    TEXT,
  sora_prompt                  TEXT,
  style_tag                    TEXT,
  time_of_day                  TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_VisualPrompts_created ON VisualPrompts(created_date DESC);

CREATE TABLE IF NOT EXISTS VoiceProfiles (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  created_by    TEXT,
  elevenlabs_settings          TEXT,
  emotion_range                TEXT,
  emphasis_rules               TEXT,
  full_response                TEXT,
  pacing_style                 TEXT,
  pause_rules                  TEXT,
  project_id                   TEXT,
  sample_monologue_1           TEXT,
  sample_monologue_2           TEXT,
  tone                         TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_VoiceProfiles_created ON VoiceProfiles(created_date DESC);

-- BYOK vault. Values are AES-GCM ciphertext; the plaintext key never leaves the Worker.
CREATE TABLE IF NOT EXISTS UserApiKeys (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  provider      TEXT NOT NULL,
  ciphertext    TEXT NOT NULL,
  iv            TEXT NOT NULL,
  hint          TEXT NOT NULL DEFAULT '',
  last_ok_at    TEXT,
  last_error    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_UserApiKeys_user_provider ON UserApiKeys(user_id, provider);

-- Non-secret per-user preferences (ASR provider choice, default models, etc.)
CREATE TABLE IF NOT EXISTS UserSettings (
  id            TEXT PRIMARY KEY,
  created_date  TEXT NOT NULL,
  updated_date  TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  attrs         TEXT NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_UserSettings_user ON UserSettings(user_id);
