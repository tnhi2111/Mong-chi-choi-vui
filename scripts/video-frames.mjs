/**
 * Tách frame của một video tham chiếu ra ảnh để xem trực tiếp (Bước 1 của việc phân tích video).
 *
 *   node scripts/video-frames.mjs <video.mp4|folder> [--fps=2] [--width=640] [--sheet]
 *
 * Ảnh ra: qa-output/frames/<tên video>/f-0001.jpg …  (+ sheet-NN.jpg nếu có --sheet:
 * mỗi sheet 4x3 frame, để xem nhiều frame trong một lần nhìn).
 * ffmpeg: biến môi trường FFMPEG_PATH, hoặc trên PATH, hoặc bản đi kèm CapCut.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=')[1] : d;
};
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
  console.error('Cần đường dẫn video hoặc thư mục. Ví dụ: node scripts/video-frames.mjs reference/videos --fps=2 --sheet');
  process.exit(2);
}
const fps = Number(flag('fps', 2));
const width = Number(flag('width', 640));
const sheet = args.includes('--sheet');

const candidates = [
  process.env.FFMPEG_PATH,
  'ffmpeg',
  `${process.env.LOCALAPPDATA ?? ''}/CapCut/Apps/9.3.0.3970/ffmpeg.exe`,
].filter(Boolean);
let ffmpeg = null;
for (const c of candidates) {
  try {
    execFileSync(c, ['-version'], { stdio: 'ignore' });
    ffmpeg = c;
    break;
  } catch {
    /* thử cái tiếp theo */
  }
}
if (!ffmpeg) {
  console.error('Không tìm thấy ffmpeg. Đặt FFMPEG_PATH trỏ tới ffmpeg.exe.');
  process.exit(2);
}

const videoRe = /\.(mp4|mov|webm|m4v|mkv)$/i;
const path = resolve(target);
const videos = statSync(path).isDirectory()
  ? readdirSync(path).filter((f) => videoRe.test(f)).map((f) => join(path, f))
  : [path];
if (!videos.length) {
  console.error(`Không có video nào trong ${target}`);
  process.exit(2);
}

for (const video of videos) {
  const name = basename(video, extname(video));
  const out = resolve('qa-output/frames', name);
  if (existsSync(out)) rmSync(out, { recursive: true });
  mkdirSync(out, { recursive: true });

  let info = '';
  try {
    // ffmpeg không có output nên luôn thoát khác 0; thông tin video nằm ở stderr.
    execFileSync(ffmpeg, ['-hide_banner', '-i', video], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    info = String(e.stderr ?? '');
  }
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', video, '-vf', `fps=${fps},scale=${width}:-2`, join(out, 'f-%04d.jpg')]);
  if (sheet) {
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', join(out, 'f-%04d.jpg'), '-vf', `scale=${Math.round(width / 2)}:-2,tile=4x3`, join(out, 'sheet-%02d.jpg')]);
  }
  const files = readdirSync(out);
  console.log(`${name}: ${files.filter((f) => f.startsWith('f-')).length} frame @ ${fps} fps -> qa-output/frames/${name}`);
  if (sheet) console.log(`  ${files.filter((f) => f.startsWith('sheet-')).length} contact sheet`);
  const meta = /Duration: ([0-9:.]+).*\n?.*Stream.*Video:.*?, (\d+x\d+).*?, ([\d.]+) fps/s.exec(info);
  if (meta) console.log(`  dài ${meta[1]} · ${meta[2]} · ${meta[3]} fps`);
}
