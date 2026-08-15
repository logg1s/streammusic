// `babel-preset-expo` đã gồm cả phần của expo-router. `react-native-worklets/plugin`
// là bắt buộc cho Reanimated 4 (plugin cũ `react-native-reanimated/plugin` đã dọn đi)
// và phải đứng CUỐI danh sách.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"],
  };
};
