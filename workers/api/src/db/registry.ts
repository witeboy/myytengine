// GENERATED from the original entity schemas - see MIGRATION-PLAN.md C-3 / C-4.
// `cols`  : declared columns, with the JSON type used to (de)serialize them.
// `cold`  : fields offloaded to R2 when serialized length exceeds COLD_THRESHOLD.
// Anything written that is NOT in `cols` lands in the `attrs` JSON column.

export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

export interface EntityDef {
  cols: Record<string, FieldType>;
  cold: string[];
}

export const COLD_THRESHOLD = 65536;

export const ENTITIES: Record<string, EntityDef> = {
  AssetPlans: {
    cols: { ai_visual_percent: 'number', archival_percent: 'number', full_response: 'string', project_id: 'string', recommended_sources: 'string', stock_broll_percent: 'number', text_animation_percent: 'number', transition_rules: 'string' },
    cold: [],
  },
  BrandIdentities: {
    cols: { channel_name: 'string', color_accent: 'string', color_primary: 'string', color_secondary: 'string', full_response: 'string', intro_concept: 'string', logo_direction: 'string', niche: 'string', outro_concept: 'string', project_id: 'string', sound_identity: 'string', tagline: 'string', thumbnail_tone: 'string', typography_body: 'string', typography_heading: 'string', visual_rules: 'string' },
    cold: [],
  },
  CalendarEntries: {
    cols: { content_theme: 'string', day_of_week: 'string', engagement_action: 'string', format: 'string', project_id: 'string', reuse_assets: 'string', status: 'string', topic_title: 'string', week_number: 'number' },
    cold: [],
  },
  ChannelThumbnailDNA: {
    cols: { background_color: 'string', banned_templates: 'string', channel_id: 'string', composition_style: 'string', emotion_bias: 'string', face_descriptions: 'string', face_reference_urls: 'string', font_family: 'string', is_active: 'boolean', logo_url: 'string', mood_bias: 'string', preferred_templates: 'string', primary_color: 'string', secondary_color: 'string', style_notes: 'string', text_color: 'string', text_style_preset: 'string', visual_style_lock: 'string' },
    cold: [],
  },
  ChannelTopics: {
    cols: { ai_notes: 'string', channel_id: 'string', format: 'string', notes: 'string', priority: 'number', project_id: 'string', scheduled_date: 'string', scheduled_time: 'string', scheduled_timezone: 'string', slot_index: 'number', status: 'string', suggested_post_time: 'string', theme_cluster: 'string', title: 'string', trend_score: 'number' },
    cold: [],
  },
  Channels: {
    cols: { ai_insights: 'string', color: 'string', description: 'string', icon_emoji: 'string', last_trend_refresh: 'string', long_form_duration_minutes: 'number', longform_per_week: 'number', name: 'string', niche: 'string', niche_label: 'string', script_mode: 'string', script_strategy: 'string', short_form_word_limit: 'number', shorts_niche: 'string', shorts_per_day: 'number', status: 'string', tone: 'string', topics_scheduled: 'number', total_topics: 'number', visual_style: 'string' },
    cold: ['ai_insights'],
  },
  Hooks: {
    cols: { hook_text: 'string', hook_type: 'string', intensity_score: 'number', is_selected: 'boolean', project_id: 'string', rank: 'number', topic_id: 'string', use_as_thumbnail: 'boolean', use_as_voiceover: 'boolean' },
    cold: [],
  },
  MediaAssets: {
    cols: { category: 'string', file_size_bytes: 'number', file_type: 'string', file_url: 'string', filename: 'string', project_id: 'string', tags: 'string', used_in_scenes: 'string' },
    cold: [],
  },
  MusicTracks: {
    cols: { audio_url: 'string', duration_seconds: 'number', genre: 'string', is_selected: 'boolean', mood: 'string', project_id: 'string', prompt: 'string', status: 'string', title: 'string', volume: 'number' },
    cold: [],
  },
  ProductionSettings: {
    cols: { beat_durations: 'string', beat_start_times: 'string', caption_animation: 'string', caption_bg_color: 'string', caption_data: 'string', caption_enabled: 'boolean', caption_font_size: 'number', caption_highlight_color: 'string', caption_max_words: 'number', caption_position: 'string', caption_stroke_width: 'number', caption_style_preset: 'string', caption_text_color: 'string', generation_task_id: 'string', project_id: 'string', selected_asset_style: 'string', selected_voice_id: 'string', story_analysis: 'string', timeline_caption_clips: 'string', timeline_overlay_clips: 'string', timeline_video_clips: 'string', total_duration_seconds: 'number', voiceover_chunks: 'string', voiceover_completed_chunks: 'number', voiceover_status: 'string', voiceover_total_chunks: 'number', voiceover_url: 'string' },
    cold: ['timeline_video_clips', 'timeline_caption_clips', 'timeline_overlay_clips', 'caption_data', 'voiceover_chunks', 'beat_durations', 'beat_start_times', 'story_analysis'],
  },
  Projects: {
    cols: { archived: 'boolean', channel_id: 'string', channel_topic_id: 'string', character_descriptions: 'string', current_step: 'number', explainer_arc: 'string', image_provider: 'string', name: 'string', niche: 'string', orientation: 'string', outline: 'string', project_mode: 'string', reference_image_url: 'string', research_notes: 'string', script_id: 'string', script_strategy_override: 'string', selected_hook_id: 'string', selected_topic_id: 'string', status: 'string', storytelling_format: 'string', target_audience: 'string', tone: 'string', video_duration_minutes: 'number', visual_style: 'string' },
    cold: [],
  },
  RetentionMaps: {
    cols: { audio_intensity: 'string', checkpoint_name: 'string', description: 'string', order_index: 'number', project_id: 'string', retention_strategy: 'string', script_id: 'string', time_end: 'string', time_start: 'string', visual_intensity: 'string' },
    cold: [],
  },
  Scenes: {
    cols: { act: 'string', animation_prompt: 'string', animation_speed: 'string', broll_id: 'string', broll_query: 'string', broll_source: 'string', broll_thumbnail: 'string', broll_url: 'string', camera_movement: 'string', duration_seconds: 'number', image_prompt: 'string', image_url: 'string', narration_text: 'string', notes: 'string', project_id: 'string', scene_number: 'number', sfx_volume: 'number', sound_effect: 'string', sound_effect_url: 'string', status: 'string', transition_duration: 'number', transition_type: 'string', video_url: 'string', visual_effects: 'string' },
    cold: ['image_prompt', 'animation_prompt'],
  },
  ScriptBatches: {
    cols: { batch_number: 'number', content: 'string', focus_area: 'string', project_id: 'string', scene_image_url: 'string', script_id: 'string', status: 'string', story_segment: 'string', synopsis: 'string', target_words: 'number', word_count: 'number' },
    cold: ['content'],
  },
  Scripts: {
    cols: { act_1: 'string', act_2: 'string', act_3: 'string', cold_open: 'string', editor_notes: 'string', estimated_duration_sec: 'number', full_script: 'string', outro: 'string', project_id: 'string', title: 'string', topic_id: 'string', version: 'string', word_count: 'number' },
    cold: ['full_script'],
  },
  ThumbnailConcepts: {
    cols: { color_scheme: 'string', concept_description: 'string', ctr_score: 'number', facial_expression: 'string', image_prompt: 'string', image_url: 'string', is_selected: 'boolean', project_id: 'string', rank: 'number', style_reference: 'string', text_overlay: 'string', visual_metaphor: 'string' },
    cold: [],
  },
  ThumbnailNiches: {
    cols: { description: 'string', icon: 'string', last_synthesized: 'string', name: 'string', synthesized_dna: 'string', template_count: 'number' },
    cold: [],
  },
  ThumbnailTemplates: {
    cols: { character_action_notes: 'string', color_strategy: 'string', composition_blueprint: 'string', emotional_tone: 'string', forensic_description: 'string', is_favorite: 'boolean', niche_id: 'string', niche_tags: 'string', quality_score: 'number', recreate_prompt: 'string', source_url: 'string', template_type: 'string', text_strategy: 'string', thumbnail_image_url: 'string' },
    cold: ['composition_blueprint'],
  },
  TimelineBlocks: {
    cols: { asset_style: 'string', background_removal_enabled: 'boolean', background_removal_url: 'string', block_type: 'string', broll_id: 'string', broll_source: 'string', broll_url: 'string', color_grade: 'string', crop_settings: 'string', duration_seconds: 'number', generated_asset_url: 'string', generation_task_id: 'string', keyframes: 'string', order_index: 'number', project_id: 'string', prompt: 'string', start_time_seconds: 'number', status: 'string', transition_duration: 'number', transition_type: 'string', volume: 'number' },
    cold: [],
  },
  TimingEntries: {
    cols: { duration_seconds: 'number', entry_order: 'number', project_id: 'string', scene_concept: 'string', script_id: 'string', spoken_text: 'string', timestamp_end: 'string', timestamp_start: 'string', transition_type: 'string' },
    cold: [],
  },
  Topics: {
    cols: { description: 'string', emotional_score: 'number', engagement_notes: 'string', is_selected: 'boolean', keyword_potential: 'string', monthly_searches: 'string', project_id: 'string', rank: 'number', storytelling_score: 'number', title: 'string', viral_score: 'number' },
    cold: [],
  },
  Transcripts: {
    cols: { full_text: 'string', project_id: 'string', status: 'string', total_words: 'number', word_timings: 'string' },
    cold: ['word_timings'],
  },
  UploadMetadata: {
    cols: { description_alt_1: 'string', description_alt_2: 'string', description_template: 'string', descriptions_json: 'string', hashtags: 'string', pinned_comment: 'string', project_id: 'string', record_type: 'string', selected_channel_id: 'string', seo_analysis: 'string', seo_strategy: 'string', status: 'string', tags: 'string', tags_long: 'string', tags_medium: 'string', tags_short: 'string', title_primary: 'string', title_variation_1: 'string', title_variation_2: 'string', title_variation_3: 'string', title_variation_4: 'string', titles_json: 'string', youtube_channels: 'string' },
    cold: [],
  },
  VisualPrompts: {
    cols: { camera_angle: 'string', character_actions: 'string', composition_notes: 'string', duration_seconds: 'number', emotional_tone: 'string', lighting: 'string', narration_text: 'string', project_id: 'string', scene_environment: 'string', scene_number: 'number', script_id: 'string', sora_prompt: 'string', style_tag: 'string', time_of_day: 'string' },
    cold: [],
  },
  VoiceProfiles: {
    cols: { elevenlabs_settings: 'string', emotion_range: 'string', emphasis_rules: 'string', full_response: 'string', pacing_style: 'string', pause_rules: 'string', project_id: 'string', sample_monologue_1: 'string', sample_monologue_2: 'string', tone: 'string' },
    cold: [],
  },
};

export const ENTITY_NAMES = Object.keys(ENTITIES);
export const isEntity = (n: string): n is keyof typeof ENTITIES =>
  Object.prototype.hasOwnProperty.call(ENTITIES, n);
