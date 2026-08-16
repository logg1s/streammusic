-- North Star: phút nghe mỗi tuần trên mỗi người dùng hoạt động.
--
-- Nguồn là play_events (có sẵn từ trước telemetry) chứ không phải analytics_events —
-- lịch sử nghe đã đủ chính xác cho chỉ số này và nó có dữ liệu lùi về quá khứ.
--
-- Lưu ý khi đọc số: /api/plays bỏ qua lượt nghe dưới 20% thời lượng, nên "phút nghe"
-- ở đây là phút nghe THẬT, không tính bấm vào rồi bỏ ngay.

select
  date_trunc('week', started_at)::date                                as week,
  count(distinct user_id)                                             as wau,
  round(sum(played_sec) / 60.0)                                       as minutes,
  round(sum(played_sec) / 60.0 / nullif(count(distinct user_id), 0), 1)
                                                                      as minutes_per_wau,
  round(count(*)::numeric / nullif(count(distinct user_id), 0), 1)    as plays_per_wau
from play_events
where started_at >= now() - interval '12 weeks'
group by 1
order by 1;
