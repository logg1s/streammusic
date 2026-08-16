-- SLI kỹ thuật: app có nhanh và có chạy được không, tách theo shell.
--
-- Tách theo shell là bắt buộc chứ không phải để cho đẹp: Tauri chặn ở wait_meta() và
-- Android đi qua ExoPlayer, gộp chung thì con số trung bình không mô tả shell nào cả.

-- 1. Thời gian tới nốt nhạc đầu tiên (time-to-first-audio).
select
  shell,
  count(*)                                                            as plays,
  round(percentile_cont(0.5) within group (order by (props ->> 'ttfaMs')::numeric))
                                                                      as p50_ms,
  round(percentile_cont(0.95) within group (order by (props ->> 'ttfaMs')::numeric))
                                                                      as p95_ms
from analytics_events
where name = 'play_start'
  and props ? 'ttfaMs'
  and server_ts >= now() - interval '7 days'
group by 1
order by 1;

-- 2. Tỉ lệ resolve YouTube hỏng — rủi ro sống còn, theo dõi hằng tuần.
--    Ngưỡng cảnh báo: > 2% ở bất kỳ shell nào thì mở postmortem.
with plays as (
  select shell, count(*) as n
  from analytics_events
  where name = 'play_start' and server_ts >= now() - interval '7 days'
  group by 1
),
fails as (
  select shell, props ->> 'reason' as reason, count(*) as n
  from analytics_events
  where name = 'resolve_fail' and server_ts >= now() - interval '7 days'
  group by 1, 2
)
select
  f.shell,
  f.reason,
  f.n                                                                 as failures,
  round(100.0 * f.n / nullif(p.n, 0), 2)                              as pct_of_plays
from fails f
left join plays p on p.shell = f.shell
order by failures desc;

-- 3. Phiên không lỗi (crash-free proxy) — phiên có playback_error / tổng số phiên.
select
  shell,
  count(distinct session_id)                                          as sessions,
  round(100.0 * count(distinct session_id) filter (
    where session_id in (
      select session_id from analytics_events where name = 'playback_error'
    )) / nullif(count(distinct session_id), 0), 2)                    as error_session_pct
from analytics_events
where server_ts >= now() - interval '7 days'
group by 1
order by 1;
