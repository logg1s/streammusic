// Không hiện cửa sổ console kèm app ở bản release trên Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    vong_lib::run()
}
