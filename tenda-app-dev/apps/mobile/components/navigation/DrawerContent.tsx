import { View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Home, ClipboardList, PlusCircle, Wallet,
  Settings, LogOut, ArrowLeftRight, ChevronRight,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text, Avatar } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { typography } from '@/theme/tokens';
import { isSeekerDevice } from '@/lib/device';
import { truncateWallet, formatFullName } from '@tenda/shared';

interface NavItem {
  name: string;
  route: string;
  icon: LucideIcon;
  meta?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Marketplace',
    items: [
      { name: 'Home', route: '/(tabs)/home', icon: Home },
      { name: 'My Gigs', route: '/(tabs)/my-gigs', icon: ClipboardList },
      { name: 'Post Gig', route: '/(tabs)/create-gig', icon: PlusCircle },
    ],
  },
  {
    title: 'Money',
    items: [
      { name: 'Trade', route: '/(tabs)/exchange', icon: ArrowLeftRight },
      { name: 'Wallet', route: '/(tabs)/wallet', icon: Wallet },
    ],
  },
  {
    title: 'Account',
    items: [
      { name: 'Settings', route: '/(tabs)/settings', icon: Settings },
    ],
  },
];

interface DrawerContentProps {
  onClose: (callback?: () => void) => void;
  onNavigate?: (route: string) => void;
}

export function DrawerContent({ onClose, onNavigate }: DrawerContentProps) {
  const { user, logout, wallets, walletAddress } = useAuthStore();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  const fullName = formatFullName(user?.first_name ?? null, user?.last_name ?? null) || 'Anonymous';

  // v2 identity is multi-wallet: prefer the primary linked wallet.
  const primaryWallet = wallets.find((w) => w.is_primary)?.address ?? walletAddress;
  const handle = primaryWallet ? truncateWallet(primaryWallet) : null;
  const isSeeker = isSeekerDevice();

  const handleNavigate = (route: string) => {
    onClose(() => {
      if (onNavigate) {
        onNavigate(route);
      } else {
        router.push(route as never);
      }
    });
  };

  const handleLogout = () => {
    onClose(async () => {
      await logout();
      router.replace('/(auth)/welcome');
    });
  };

  const handleProfilePress = () => {
    onClose(() => router.push('/(tabs)/profile'));
  };

  return (
    <View
      style={[
        s.container,
        {
          backgroundColor: theme.colors.surface.card,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* Header, avatar + name + handle + role pill */}
      <TouchableOpacity
        onPress={handleProfilePress}
        activeOpacity={0.85}
        style={[
          s.header,
          {
            paddingTop: insets.top + 12,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        <Avatar
          src={user?.avatar_url}
          name={fullName}
          size="lg"
          gradient="accent"
        />
        <View style={s.headerMeta}>
          <Text size={18} weight="bold" color={theme.colors.content.primary} style={s.headerName} numberOfLines={1}>
            {fullName}
          </Text>
          {handle && (
            <Text style={s.headerHandle} color={theme.colors.content.tertiary} numberOfLines={1}>
              {handle}
            </Text>
          )}
          {isSeeker && (
            <View style={[s.headerBadge, { backgroundColor: theme.colors.brand.primarySurface }]}>
              <Text size={11} weight="semibold" color={theme.colors.brand.primary}>
                Seeker
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Body, sections + rows */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {NAV_SECTIONS.map((section) => (
          <View key={section.title}>
            <Text style={s.sectionLabel} color={theme.colors.content.tertiary}>
              {section.title.toUpperCase()}
            </Text>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.route;
              return (
                <TouchableOpacity
                  key={item.name}
                  onPress={() => handleNavigate(item.route)}
                  activeOpacity={0.7}
                  style={s.row}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                >
                  <View
                    style={[
                      s.rowIcon,
                      {
                        backgroundColor: isActive
                          ? theme.colors.brand.primarySurface
                          : theme.colors.surface.inset,
                      },
                    ]}
                  >
                    <Icon
                      size={15}
                      color={isActive ? theme.colors.brand.primary : theme.colors.content.secondary}
                    />
                  </View>
                  <Text size={14.5} weight="medium" color={theme.colors.content.primary} style={s.rowLabel}>
                    {item.name}
                  </Text>
                  {item.meta && (
                    <Text style={s.rowMeta} color={theme.colors.content.tertiary}>
                      {item.meta}
                    </Text>
                  )}
                  <ChevronRight size={13} color={theme.colors.content.tertiary} />
                </TouchableOpacity>
              );
            })}
            <View style={[s.divider, { backgroundColor: theme.colors.border.subtle }]} />
          </View>
        ))}

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          activeOpacity={0.7}
          style={s.row}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <View
            style={[
              s.rowIcon,
              { backgroundColor: 'rgba(203,58,58,0.10)' },
            ]}
          >
            <LogOut size={15} color={theme.colors.feedback.danger.base} />
          </View>
          <Text size={14.5} weight="semibold" color={theme.colors.feedback.danger.base} style={s.rowLabel}>
            Sign out
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
  },
  headerName: {
    letterSpacing: -0.18,
  },
  headerHandle: {
    fontFamily: typography.fonts.mono.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 12,
  },
  sectionLabel: {
    fontFamily: typography.fonts.mono.semibold,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.95,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
  },
  row: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    letterSpacing: -0.075,
  },
  rowMeta: {
    fontFamily: typography.fonts.mono.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    marginHorizontal: 20,
    marginVertical: 6,
  },
});
