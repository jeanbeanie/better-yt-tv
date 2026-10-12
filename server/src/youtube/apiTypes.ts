// Minimal YouTube Data API response shapes, only the fields this app reads

export type YoutubeChannelsListResponse = {
  items?: {
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }[];
};

export type YoutubePlaylistItem = {
  snippet?: {
    resourceId?: {
      videoId?: string;
    };
    channelId?: string;
    title?: string;
    publishedAt?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

export type YoutubePlaylistItemsListResponse = {
  items?: YoutubePlaylistItem[];
};

export type YoutubeVideo = {
  id?: string;
  snippet?: {
    channelId?: string;
    title?: string;
    publishedAt?: string;
    liveBroadcastContent?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  contentDetails?: {
    duration?: string;
  };
  liveStreamingDetails?: {
    scheduledStartTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
  };
};

export type YoutubeVideosListResponse = {
  items?: YoutubeVideo[];
};

export type YoutubeSubscriptionListItem = {
  snippet?: {
    resourceId?: {
      channelId?: string;
    };
    title?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

export type YoutubeSubscriptionsListResponse = {
  items?: YoutubeSubscriptionListItem[];
  nextPageToken?: string;
};
