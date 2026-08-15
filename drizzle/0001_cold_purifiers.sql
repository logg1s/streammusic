CREATE TYPE "public"."radio_subject" AS ENUM('video', 'artist');--> statement-breakpoint
CREATE TYPE "public"."youtube_taste_source" AS ENUM('liked', 'own_playlist');--> statement-breakpoint
CREATE TABLE "playlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playlist_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"track_id" uuid,
	"youtube_video_id" text,
	CONSTRAINT "playlist_items_one_source" CHECK (("playlist_items"."track_id" is null) <> ("playlist_items"."youtube_video_id" is null))
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"seed_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radio_feedback" (
	"user_id" text NOT NULL,
	"subject" "radio_subject" NOT NULL,
	"subject_key" text NOT NULL,
	"skips" integer DEFAULT 0 NOT NULL,
	"finishes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radio_feedback_user_id_subject_subject_key_pk" PRIMARY KEY("user_id","subject","subject_key")
);
--> statement-breakpoint
CREATE TABLE "radio_seeds" (
	"seed_key" text PRIMARY KEY NOT NULL,
	"candidate_ids" text[] NOT NULL,
	"used_playlist_ids" text[] NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"channel_title" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"scope" text,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"taste_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "youtube_taste_artists" (
	"user_id" text NOT NULL,
	"artist_key" text NOT NULL,
	"label" text NOT NULL,
	"weight" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "youtube_taste_artists_user_id_artist_key_pk" PRIMARY KEY("user_id","artist_key")
);
--> statement-breakpoint
CREATE TABLE "youtube_taste_videos" (
	"user_id" text NOT NULL,
	"video_id" text NOT NULL,
	"source" "youtube_taste_source" NOT NULL,
	CONSTRAINT "youtube_taste_videos_user_id_video_id_pk" PRIMARY KEY("user_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "youtube_tracks" (
	"video_id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist_name" text,
	"channel_title" text,
	"duration_sec" integer,
	"blocked" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_youtube_video_id_youtube_tracks_video_id_fk" FOREIGN KEY ("youtube_video_id") REFERENCES "public"."youtube_tracks"("video_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_feedback" ADD CONSTRAINT "radio_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_accounts" ADD CONSTRAINT "youtube_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_taste_artists" ADD CONSTRAINT "youtube_taste_artists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_taste_videos" ADD CONSTRAINT "youtube_taste_videos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_taste_videos" ADD CONSTRAINT "youtube_taste_videos_video_id_youtube_tracks_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."youtube_tracks"("video_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playlist_items_idx" ON "playlist_items" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE INDEX "playlists_user_idx" ON "playlists" USING btree ("user_id","created_at");