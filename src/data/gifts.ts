/**
 * ────────────────────────────────────────────────────────────────────────────
 *  GIFTS — every glowing object in the gift room comes from this list.
 *
 *  • Add a gift  → copy one block, give it a new `id`.
 *  • Remove one  → delete its block.
 *  • Photos      → put files in /public/memories/ and change the paths.
 *                  (jpg / webp / avif all work — keep them ≤ 1600px wide.)
 *
 *  `shape` picks the 3D object:  'box' | 'capsule' | 'star' | 'orb' | 'envelope'
 *  `kind`  'memory' opens a memory page, 'letter' opens the love letter
 *          (the letter text lives in src/config/birthday.ts).
 *  `tint`  a soft accent colour for that object's glow.
 * ────────────────────────────────────────────────────────────────────────────
 */

export type GiftShape = 'box' | 'capsule' | 'star' | 'orb' | 'envelope';

export interface Photo {
  src: string;
  alt: string;
  caption?: string;
}

export interface TimelineItem {
  date?: string;
  title: string;
  text?: string;
  image?: Photo;
}

export interface Gift {
  id: string;
  kind: 'memory' | 'letter';
  shape: GiftShape;
  tint: string;
  /** Short title shown on the object and on top of the memory page. */
  title: string;
  subtitle?: string;
  date?: string;
  location?: string;
  coverImage?: Photo;
  /** A short message shown under the cover photo. */
  message?: string;
  /** More of the story, one paragraph each, after the message. */
  story?: string[];
  timeline?: TimelineItem[];
  /** Floating polaroids. */
  photos?: Photo[];
  /** A handwritten-style personal note at the end. */
  note?: string;
}

const img = (n: string, alt: string, caption?: string): Photo => ({
  src: `memories/${n}`,
  alt,
  caption,
});

export const gifts: Gift[] = [
  {
    id: 'the-day-we-met',
    kind: 'memory',
    shape: 'box',
    tint: '#e9b7c0',
    title: 'The day we met',
    subtitle: 'Ngày mình gặp nhau',
    message: 'Queo thì bọn mình gặp nhau trên cái app hẹn hò cho lé biên 🤡',
    story: [
      'Lần đầu gặp thì cx k mang nghĩa là date cho lắm mà em chỉ nghĩ đơn giản là bạn bè đi cf chơi chơi nên để lại một ấn tượng kì lạ khó quên cho chị nhưng cx lại là lí do để chúng ta có thêm nhiều cuộc gặp gỡ về sau =))))',
    ],
  },
  {
    id: 'first-date',
    kind: 'memory',
    shape: 'capsule',
    tint: '#f1d3c4',
    title: 'Our first date',
    subtitle: 'Ngày đầu tiên đi chơi',
    coverImage: img('first-date-1.jpg', 'Hai đứa mình buổi tối, dưới mái hiên sọc và viền đèn đỏ'),
    message: 'Em cx k biết cuộc nào là first date, chỉ là đơn giản bọn mình cảm thấy thoải mái vui vẻ khi gặp nhau nên cứ đi thoi 😎',
    story: [
      'Cũng không biết thích chị từ lúc nào, cảm thấy chị lo cho từng thứ một, nhìn chị càng ngày càng thấy đẹp. Đùng phát thế là biết thích rồi đó 🥰',
      'Xong rồi vào một ngày đẹp trời em cũng không giấu nổi nữa nên là tỏ tình chị :))) em vẫn nhớ là lúc đó u naked 🤡',
    ],
    photos: [
      img('first-date-booth-1.jpg', 'Photobooth của hai đứa mình, tấm 1'),
      img('first-date-booth-2.jpg', 'Photobooth của hai đứa mình, tấm 2'),
      img('first-date-booth-3.jpg', 'Photobooth của hai đứa mình, tấm 3'),
      img('first-date-booth-4.jpg', 'Photobooth của hai đứa mình, tấm 4'),
    ],
  },
  {
    id: 'first-trip',
    kind: 'memory',
    shape: 'star',
    tint: '#f3e3c8',
    title: 'Our first trip',
    subtitle: 'Lần đầu đi du lịch',
    coverImage: img('first-trip-1.jpg', 'Hai đứa mình trên sân gỗ nhìn ra núi ở Tam Đảo'),
    message:
      'Để nói thì có 2 trip du lịch trước và sau khi chúng mình chính thức là ny. Nhưng em xinloi em thích để trip Tam Đảo là trip đầu huhu 😭. Tại bả kêu hồi đó bà rất vui vì trip này chúng mình là ny chính thức nên hạnh phúc hơn trip trước đó',
    story: ['Dù ngày đó có hơi nắng nóng chơi cũng có chút mệt mỏi nhưng cũng có nhiều kỉ niệm vui vẻ hí hí'],
  },
  {
    id: 'ordinary-day',
    kind: 'memory',
    shape: 'orb',
    tint: '#dcc6e0',
    title: 'An ordinary day',
    subtitle: 'Một ngày rất bình thường',
    coverImage: img('ordinary-day-1.jpg', 'Một buổi tô tranh ở nhà, mặt đầy dấu son'),
    message:
      'Một ngày bình thường em không ổn, chị cũng thế nhưng cuối ngày bọn mình vẫn có nhau bên nhau tâm sự. Chị bảo chị sẽ qua gặp em to cheer me up, and u did arghhhhh i love u so muchhhhh 😘🫶',
    photos: [
      img('ordinary-day-2.jpg', 'Vẫn buổi tô tranh đó, tai thỏ trên đầu'),
      img('ordinary-day-3.jpg', 'Nằm cạnh nhau'),
    ],
  },
  {
    id: 'letter',
    kind: 'letter',
    shape: 'envelope',
    tint: '#f4e6d8',
    title: 'A letter for you',
    subtitle: 'Một lá thư',
  },
];
