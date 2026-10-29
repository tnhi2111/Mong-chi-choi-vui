# Video tham chiếu

Bỏ các file video (.mp4 …) vào thư mục này — chúng được git bỏ qua, chỉ dùng để phân tích.

Tách frame ra ảnh để xem:

```bash
node scripts/video-frames.mjs reference/videos --fps=2 --sheet
# -> qa-output/frames/<tên video>/f-0001.jpg …  + sheet-01.jpg (4x3 frame mỗi tấm)
```

Kết quả phân tích viết vào `reference/VIDEO_ANALYSIS.md`.
