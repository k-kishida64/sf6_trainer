# Video drills

動画ファイル名に決まった命名規則はありません。好きな名前の MP4 ファイルをこのフォルダへ置き、`src/App.tsx` の `videos` 配列にパスと表示名を登録してください。

スマホからは画面の `Add MOV / MP4 / GIF` からファイルを選択できます。MOV/MP4 はブラウザ内の FFmpeg で GIF に変換されます。変換と再生は端末内で完結し、選択したファイルは現在の画面を開いている間だけ利用できます。再読み込みすると再選択が必要です。

例:

- `jump-in-response.mp4`
- `drive-impact-punish.mp4`
- `throw-escape.mp4`

`Start drill` を押すと、登録済みの動画からランダムに 1 本が選ばれます。