/**
 * Phiên bản app, đọc từ package.json lúc build.
 *
 * Khai một hằng thay vì import package.json: import sẽ kéo cả tệp đó vào bundle client
 * kèm danh sách dependency. Giá trị này phải khớp với `version` trong package.json,
 * mobile/app.json và src-tauri/tauri.conf.json — cả bốn được nâng cùng lúc khi phát hành.
 */
export const APP_VERSION = "0.3.0";
