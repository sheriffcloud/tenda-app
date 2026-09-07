import { useCallback, useEffect } from 'react';
import { scheduleOnRN } from 'react-native-worklets';
import { 
  View, 
  Pressable, 
  Dimensions, 
  StyleSheet as RNStyleSheet 
} from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { DrawerContent } from './DrawerContent';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.86);
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.8,
};

const EDGE_SWIPE_WIDTH = 24;

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  onNavigate?: (route: string) => void;
  children: React.ReactNode;
}

export function Drawer({ isOpen, onClose, onOpen, onNavigate, children }: DrawerProps) {
  const { theme } = useUnistyles();
  const translateX = useSharedValue(-DRAWER_WIDTH);
  const overlayOpacity = useSharedValue(0);
  const isOpenShared = useSharedValue(false);

  useEffect(() => {
    isOpenShared.value = isOpen;
    if (isOpen) {
      translateX.value = withSpring(0, SPRING_CONFIG);
      overlayOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateX.value = withSpring(-DRAWER_WIDTH, SPRING_CONFIG);
      overlayOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isOpen, isOpenShared, translateX, overlayOpacity]);

  const closeDrawer = useCallback(() => {
    'worklet';
    translateX.value = withSpring(-DRAWER_WIDTH, SPRING_CONFIG);
    overlayOpacity.value = withTiming(0, { duration: 200 });
    scheduleOnRN(onClose);
  }, [onClose, translateX, overlayOpacity]);

  const handleClose = useCallback((callback?: () => void) => {
    translateX.value = withTiming(-DRAWER_WIDTH, { duration: 220 }, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(onClose);
    });
    overlayOpacity.value = withTiming(0, { duration: 220 });
    if (callback) callback();
  }, [onClose, translateX, overlayOpacity]);

  const openDrawer = useCallback(() => {
    'worklet';
    translateX.value = withSpring(0, SPRING_CONFIG);
    overlayOpacity.value = withTiming(1, { duration: 200 });
    if (onOpen) scheduleOnRN(onOpen);
  }, [translateX, overlayOpacity, onOpen]);

  // Drawer pan (close), scoped to drawer only
  const drawerPanGesture = Gesture.Pan()
    .minDistance(10)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      'worklet';
      const newTranslateX = Math.min(0, event.translationX);
      translateX.value = newTranslateX;
      overlayOpacity.value = interpolate(
        newTranslateX,
        [-DRAWER_WIDTH, 0],
        [0, 1],
        Extrapolation.CLAMP
      );
    })
    .onEnd((event) => {
      'worklet';
      const shouldOpen = event.velocityX > 500 || translateX.value > -DRAWER_WIDTH / 2;
      if (shouldOpen) {
        openDrawer();
      } else {
        closeDrawer();
      }
    });

  // Edge pan (open), only when closed
  const edgePanGesture = Gesture.Pan()
    .minDistance(10)
    .activeOffsetX([10, 9999])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      'worklet';
      const newTranslateX = Math.min(0, event.translationX - DRAWER_WIDTH);
      translateX.value = newTranslateX;
      overlayOpacity.value = interpolate(
        newTranslateX,
        [-DRAWER_WIDTH, 0],
        [0, 1],
        Extrapolation.CLAMP
      );
    })
    .onEnd((event) => {
      'worklet';
      const shouldOpen = event.velocityX > 500 || translateX.value > -DRAWER_WIDTH / 2;
      if (shouldOpen) {
        openDrawer();
      } else {
        closeDrawer();
      }
    });

  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <View style={styles.container}>
      {/* Main Content */}
      {children}

      {/* Left-edge swipe zone for opening when closed */}
      {!isOpen && (
        <GestureDetector gesture={edgePanGesture}>
          <View style={styles.edgeSwipeZone} />
        </GestureDetector>
      )}

      {/* Overlay, Pressable handles tap-to-close */}
      {isOpen && (
        <Animated.View
          style={[
            styles.overlay,
            { backgroundColor: 'rgba(0, 0, 0, 0.55)' },
            overlayAnimatedStyle,
          ]}
        >
          <Pressable style={styles.overlayPressable} onPress={() => handleClose()} />
        </Animated.View>
      )}

      {/* Drawer, pan only on drawer to avoid blocking taps */}
      <GestureDetector gesture={drawerPanGesture}>
        <Animated.View
          style={[
            styles.drawer,
            { width: DRAWER_WIDTH, backgroundColor: theme.colors.surface.background },
            drawerAnimatedStyle,
          ]}
        >
          <DrawerContent onClose={handleClose} onNavigate={onNavigate} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = RNStyleSheet.create({
  container: {
    flex: 1,
  },
  edgeSwipeZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_SWIPE_WIDTH,
    zIndex: 5,
  },
  overlay: {
    ...RNStyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  overlayPressable: {
    flex: 1,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 22,
  },
});
