import 'dart:async';
import 'dart:ui';

import 'package:dio/dio.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_background_service_android/flutter_background_service_android.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:vibration/vibration.dart';

import '../config.dart';
import '../models/agent_metric.dart';
import 'secure_store.dart';

const String _channelId = 'cygnetci_alerts';
const String _fgChannelId = 'cygnetci_monitoring';

/// Android background monitoring. Keeps polling while the app is closed/locked
/// via a foreground service and raises an alarm notification on breach.
/// (iOS cannot run periodic background polling — this is a no-op there.)
class BackgroundMonitor {
  static Future<void> initialize() async {
    final service = FlutterBackgroundService();
    await service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: onStart,
        autoStart: false,
        isForegroundMode: true,
        notificationChannelId: _fgChannelId,
        initialNotificationTitle: 'CygnetCI monitoring',
        initialNotificationContent: 'Watching agents for critical alerts',
        foregroundServiceNotificationId: 888,
      ),
      iosConfiguration: IosConfiguration(autoStart: false, onForeground: onStart),
    );
  }

  static Future<void> start() async {
    final service = FlutterBackgroundService();
    if (!await service.isRunning()) {
      await service.startService();
    }
  }

  static Future<void> stop() async {
    FlutterBackgroundService().invoke('stopService');
  }
}

@pragma('vm:entry-point')
void onStart(ServiceInstance service) async {
  DartPluginRegistrant.ensureInitialized();

  final notifications = FlutterLocalNotificationsPlugin();
  await notifications.initialize(const InitializationSettings(
    android: AndroidInitializationSettings('@mipmap/ic_launcher'),
  ));

  if (service is AndroidServiceInstance) {
    service.setAsForegroundService();
  }

  service.on('stopService').listen((_) => service.stopSelf());

  Timer.periodic(const Duration(seconds: AppConfig.pollIntervalSeconds), (_) async {
    try {
      await _pollAndAlert(notifications);
    } catch (_) {
      /* never let the loop die */
    }
  });
}

Future<void> _pollAndAlert(FlutterLocalNotificationsPlugin notifications) async {
  final token = await SecureStore.getToken();
  if (token == null) return;
  final baseUrl = await SecureStore.getBaseUrl();

  final dio = Dio(BaseOptions(
    baseUrl: baseUrl,
    headers: {'Authorization': 'Bearer $token'},
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 20),
  ));

  final tRes = await dio.get('/settings/alert-thresholds');
  final thresholds = Thresholds.fromJson(Map<String, dynamic>.from(tRes.data));
  final mRes = await dio.get('/monitoring/agents/metrics');
  final agents = (mRes.data as List).cast<Map<String, dynamic>>().map(AgentMetric.fromJson).toList();

  final breaches = <Breach>[];
  for (final a in agents) {
    if (a.status == 'offline') continue;
    if (a.cpu >= thresholds.cpu) breaches.add(Breach(a, 'CPU', a.cpu, thresholds.cpu));
    if (a.memory >= thresholds.memory) breaches.add(Breach(a, 'Memory', a.memory, thresholds.memory));
    if (a.disk >= thresholds.disk) breaches.add(Breach(a, 'Disk', a.disk, thresholds.disk));
  }

  if (breaches.isEmpty) return;

  // Strong vibration + high-importance full-screen notification.
  try {
    if (await Vibration.hasVibrator() ?? false) {
      Vibration.vibrate(pattern: [0, 800, 400, 800, 400, 800], intensities: [0, 255, 0, 255, 0, 255]);
    }
  } catch (_) {}

  final body = breaches.take(4).map((b) => b.label).join('\n');
  await notifications.show(
    999,
    'Critical: ${breaches.length} alert(s)',
    body,
    NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        'CygnetCI Critical Alerts',
        channelDescription: 'Critical monitoring alerts',
        importance: Importance.max,
        priority: Priority.high,
        category: AndroidNotificationCategory.alarm,
        fullScreenIntent: true,
        playSound: true,
        enableVibration: true,
        styleInformation: BigTextStyleInformation(body),
      ),
    ),
  );
}
