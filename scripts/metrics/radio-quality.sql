-- Chất lượng gợi ý của radio, đo bằng hành vi bỏ bài.
--
-- Phải dùng analytics_events chứ KHÔNG dùng play_events: /api/plays cố tình vứt bỏ
-- lượt nghe dưới 20% thời lượng, mà đó chính là tín hiệu "gợi ý sai" ta cần đếm.
-- Đây là lý do cụ thể khiến telemetry tồn tại — play_events không trả lời được.

-- 1. Tỉ lệ bỏ sớm, tách theo bài do radio đề xuất và bài người dùng tự chọn.
select
  coalesce(props ->> 'origin', 'unknown')                             as origin,
  count(*)                                                            as plays,
  round(100.0 * count(*) filter (where (props ->> 'skippedEarly')::boolean), 1)
                                                                      as skipped_early_pct,
  round(100.0 * count(*) filter (where (props ->> 'completed')::boolean), 1)
                                                                      as completed_pct
from analytics_events
where name = 'play_end'
  and server_ts >= now() - interval '7 days'
group by 1
order by plays desc;

-- 2. Radio có thật sự trở thành mặc định không (kiểm chứng quyết định autoplay-ON).
with sessions as (
  select
    session_id,
    bool_or(name = 'radio_seed')                                      as seeded,
    bool_or(name = 'queue_end')                                       as ran_dry,
    count(*) filter (where name = 'play_start')                       as plays
  from analytics_events
  where server_ts >= now() - interval '7 days'
  group by 1
)
select
  count(*)                                                            as sessions,
  round(100.0 * count(*) filter (where seeded) / nullif(count(*), 0), 1)
                                                                      as radio_seeded_pct,
  round(100.0 * count(*) filter (where ran_dry) / nullif(count(*), 0), 1)
                                                                      as ran_dry_pct,
  round(avg(plays), 1)                                                as avg_plays_per_session
from sessions
where plays > 0;
