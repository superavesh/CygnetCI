import 'package:audioplayers/audioplayers.dart';
import 'package:vibration/vibration.dart';

/// Continuous alarm: looping vibration + looping sound until stopped.
/// (Foreground on both platforms; Android can also run this from the
/// background service. iOS only vibrates while the app is open.)
class AlarmService {
  static final AlarmService instance = AlarmService._();
  AlarmService._();

  final AudioPlayer _player = AudioPlayer();
  bool _active = false;
  bool get isActive => _active;

  Future<void> start() async {
    if (_active) return;
    _active = true;

    // Looping vibration (repeat from index 0 = continuous until cancel).
    try {
      if (await Vibration.hasVibrator() ?? false) {
        Vibration.vibrate(pattern: [0, 800, 500, 800, 500], repeat: 0);
      }
    } catch (_) {/* ignore */}

    // Looping alarm sound.
    try {
      await _player.setReleaseMode(ReleaseMode.loop);
      await _player.play(AssetSource('alarm.mp3'));
    } catch (_) {/* ignore if asset/audio unavailable */}
  }

  Future<void> stop() async {
    _active = false;
    try {
      Vibration.cancel();
    } catch (_) {}
    try {
      await _player.stop();
    } catch (_) {}
  }
}
