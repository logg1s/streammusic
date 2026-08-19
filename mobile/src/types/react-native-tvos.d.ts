import type { ScrollViewProps as CompleteScrollViewProps } from "react-native/Libraries/Components/ScrollView/ScrollView";

// react-native-tvos 0.86.2-0 publishes its list types from a sibling package.
// After a clean workspace install, that package's inherited ScrollView props are
// lost at the re-export boundary. Merge the complete native props back in.
declare module "@react-native-tvos/virtualized-lists" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars -- declaration merging intentionally augments the generic upstream interface.
  interface VirtualizedListWithoutRenderItemProps<ItemT>
    extends CompleteScrollViewProps {}
}
