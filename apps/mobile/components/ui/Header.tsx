import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ArrowLeft } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';

type HeaderVariant = 'standard' | 'large';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  rightIcon?: LucideIcon;
  onRightPress?: () => void;
  rightTinted?: boolean;
  rightActive?: boolean;
  transparent?: boolean;
  variant?: HeaderVariant;
}

export function Header({
  title,
  subtitle,
  showBack = false,
  onBackPress,
  rightIcon: RightIcon,
  onRightPress,
  rightTinted = false,
  rightActive = false,
  transparent = false,
  variant = 'standard',
}: HeaderProps) {
  const { theme } = useUnistyles();
  const router = useRouter();
  // Edge-to-edge (SDK 54): the app draws behind the status bar. Every screen
  // mounts Header inside a ScreenContainer whose SafeAreaView never claims the
  // top edge, so the header owns the top inset here, once, for all screens.
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  // Shared right-slot action, rendered identically by both variants so a
  // `rightIcon` passed to a large header (e.g. Trade's "post offer" +) is never
  // silently dropped.
  const rightButton = RightIcon ? (
    <Pressable
      onPress={onRightPress}
      style={({ pressed }) => [
        styles.iconBtn,
        { backgroundColor: rightTinted ? theme.colors.surface.inset : 'transparent' },
        pressed && { opacity: 0.7 },
      ]}
      hitSlop={4}
      accessibilityRole="button"
    >
      <RightIcon size={18} color={theme.colors.content.secondary} />
      {rightActive && (
        <View style={[styles.activeDot, { backgroundColor: theme.colors.brand.solid }]} />
      )}
    </Pressable>
  ) : null;

  if (variant === 'large') {
    return (
      <View
        style={[
          styles.lhdr,
          { paddingTop: styles.lhdr.paddingTop + insets.top },
          { backgroundColor: transparent ? 'transparent' : theme.colors.surface.background },
        ]}
      >
        <View style={styles.lhdrRow}>
          <View style={styles.lhdrText}>
            {title && (
              <Text style={[styles.lhdrTitle, { color: theme.colors.content.primary }]} numberOfLines={1}>
                {title}
              </Text>
            )}
            {subtitle && (
              <Text style={[styles.lhdrSub, { color: theme.colors.content.tertiary }]} numberOfLines={2}>
                {subtitle}
              </Text>
            )}
          </View>
          {rightButton}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.hdr,
        { paddingTop: insets.top, height: styles.hdr.height + insets.top },
        transparent
          ? { backgroundColor: 'transparent' }
          : {
              backgroundColor: theme.colors.surface.background,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border.subtle,
            },
      ]}
    >
      <View style={styles.slot}>
        {showBack && (
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: theme.colors.surface.inset },
              pressed && { opacity: 0.7 },
            ]}
            hitSlop={4}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={18} color={theme.colors.content.secondary} />
          </Pressable>
        )}
      </View>

      <View style={styles.center}>
        {title && (
          <Text
            style={[styles.title, { color: theme.colors.content.primary }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        )}
      </View>

      <View style={[styles.slot, styles.slotRight]}>{rightButton}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  hdr: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  slot: {
    width: 40,
    alignItems: 'flex-start',
  },
  slotRight: {
    alignItems: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.17,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lhdr: {
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  lhdrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lhdrText: {
    flex: 1,
  },
  lhdrTitle: {
    fontSize: 20,
    lineHeight: 33,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  lhdrSub: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
});
