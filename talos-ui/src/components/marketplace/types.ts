export type PluginType = 'skill' | 'mcp' | 'agent';
export type DiscoverySortMode = 'popular' | 'trending' | 'top_rated' | 'recent' | 'new_and_rising';
export type MarketplaceTab = 'all' | 'skills' | 'mcp' | 'agents';

export interface Plugin {
  id: string;
  slug: string;
  name: string;
  description: string;
  short_desc?: string;
  long_desc_md?: string;
  category?: string;
  plugin_type: PluginType;
  latest_version: string;
  publisher_handle: string;
  publisher_name: string;
  publisher_verified?: boolean;
  builder_username?: string;
  builder_display_name?: string;
  builder_verified?: boolean;
  builder_official?: boolean;
  builder_badges?: string[];
  downloads_count: number;
  stars_count?: number;
  rating_count?: number;
  rating_avg?: number | null;
  rating_weighted?: number | null;
  rating_hist?: number[];
  capabilities_snapshot?: any;
  configuration_schema?: any[];
  configuration_metadata?: Record<string, any>;
  endpoint_url?: string;
  is_installed: boolean;
  installed_version?: string;
  is_owner?: boolean;
  status?: 'published' | 'draft' | 'archived';
  install_status?: 'ready' | 'warning' | 'error';
  install_logs?: string;
  install_error?: string;
  tags?: string[];
  website_url?: string;
  github_url?: string;
  created_at?: string;
}

export interface PluginVersion {
  id: string;
  plugin_id: string;
  version: string;
  changelog?: string;
  artifact_sha256?: string;
  artifact_size?: number;
  status?: 'published' | 'draft' | 'deprecated' | 'yanked';
  capabilities_snapshot?: any;
  created_at: string;
  published_at?: string;
}

export interface PluginInstallation {
  plugin_id: string;
  installed: boolean;
  installed_version?: string;
  latest_version?: string;
  update_available?: boolean;
  status?: 'installed' | 'installing' | 'failed';
}

export interface Builder {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  website_url?: string;
  social_links?: Record<string, string>;
  is_verified: boolean;
  is_official: boolean;
  status: string;
  plugin_count: number;
  install_count: number;
  rating_count: number;
  review_count: number;
  rating_avg: number | null;
  badges?: string[];
  created_at?: string;
}

export interface ReviewReply {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name: string;
}

export interface Review {
  id: string;
  plugin_id: string;
  user_id: string;
  body: string;
  helpful_count: number;
  created_at: string;
  updated_at: string;
  reviewer_name: string;
  rating_stars?: number;
  version_used?: string;
  replies?: ReviewReply[];
}
