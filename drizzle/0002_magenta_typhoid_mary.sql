CREATE TABLE "play_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"track_id" uuid,
	"youtube_video_id" text,
	"artist_key" text NOT NULL,
	"played_sec" integer NOT NULL,
	"duration_sec" integer,
	"completed" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_events_one_source" CHECK (("play_events"."track_id" is null) <> ("play_events"."youtube_video_id" is null))
);
--> statement-breakpoint
ALTER TABLE "play_events" ADD CONSTRAINT "play_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_events" ADD CONSTRAINT "play_events_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_events" ADD CONSTRAINT "play_events_youtube_video_id_youtube_tracks_video_id_fk" FOREIGN KEY ("youtube_video_id") REFERENCES "public"."youtube_tracks"("video_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "play_events_user_time_idx" ON "play_events" USING btree ("user_id","started_at");