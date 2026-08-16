CREATE TYPE "public"."analytics_shell" AS ENUM('web', 'android', 'windows');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"install_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"shell" "analytics_shell" NOT NULL,
	"app_version" text,
	"name" text NOT NULL,
	"props" jsonb,
	"client_ts" timestamp with time zone NOT NULL,
	"server_ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analytics_events_name_time_idx" ON "analytics_events" USING btree ("name","server_ts");--> statement-breakpoint
CREATE INDEX "analytics_events_install_time_idx" ON "analytics_events" USING btree ("install_id","server_ts");--> statement-breakpoint
CREATE INDEX "analytics_events_session_idx" ON "analytics_events" USING btree ("session_id");