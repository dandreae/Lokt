import { StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';

export function ListDivider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, inset ? { marginLeft: inset } : null]} />;
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider },
});
