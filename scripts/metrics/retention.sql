-- Retention theo nhóm tuần: bao nhiêu phần trăm quay lại ở tuần +1 và tuần +2.
--
-- Đây là chỉ số phân biệt "app dùng được" với "app đáng giữ". Mốc quan tâm là W2:
-- người quay lại sau hai tuần gần như chắc chắn đã đưa Vong vào thói quen.

with first_week as (
  select user_id, date_trunc('week', min(started_at)) as cohort
  from play_events
  group by 1
),
active_weeks as (
  select distinct user_id, date_trunc('week', started_at) as week
  from play_events
)
select
  f.cohort::date                                                      as cohort,
  count(*)                                                            as size,
  round(100.0 * count(*) filter (
    where exists (
      select 1 from active_weeks a
      where a.user_id = f.user_id and a.week = f.cohort + interval '1 week'
    )) / count(*), 1)                                                 as w1_pct,
  round(100.0 * count(*) filter (
    where exists (
      select 1 from active_weeks a
      where a.user_id = f.user_id and a.week = f.cohort + interval '2 weeks'
    )) / count(*), 1)                                                 as w2_pct
from first_week f
-- Nhóm chưa đủ hai tuần tuổi thì W2 luôn bằng 0 và sẽ kéo tụt cách đọc biểu đồ.
where f.cohort <= date_trunc('week', now()) - interval '2 weeks'
group by 1
order by 1;
