import 'dart:async';
import 'package:flutter/foundation.dart';

import '../config.dart';
import '../models/agent_metric.dart';
import 'alarm_service.dart';
import 'api_service.dart';

/// Foreground polling + breach detection. Drives the alarm and the UI.
class MonitoringController extends ChangeNotifier {
  final ApiService _api = ApiService();

  Timer? _timer;
  List<AgentMetric> agents = [];
  Thresholds thresholds = const Thresholds();
  List<Breach> breaches = [];
  bool loading = false;
  bool alarming = false;
  bool sessionExpired = false;
  String? error;

  final Set<String> _acked = {}; // locally acknowledged breach keys

  void start() {
    poll();
    _timer?.cancel();
    _timer = Timer.periodic(
      const Duration(seconds: AppConfig.pollIntervalSeconds),
      (_) => poll(),
    );
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> poll() async {
    loading = true;
    notifyListeners();
    try {
      final results = await Future.wait([_api.getThresholds(), _api.getMetrics()]);
      thresholds = results[0] as Thresholds;
      agents = results[1] as List<AgentMetric>;
      error = null;
      _computeBreaches();
      _evaluateAlarm();
    } on ApiException catch (e) {
      if (e.status == 401) {
        sessionExpired = true;
        stop();
      }
      error = e.message;
    } catch (e) {
      error = e.toString();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  void _computeBreaches() {
    final list = <Breach>[];
    for (final a in agents) {
      if (a.status == 'offline') continue; // no live metrics to trust
      if (a.cpu >= thresholds.cpu) list.add(Breach(a, 'CPU', a.cpu, thresholds.cpu));
      if (a.memory >= thresholds.memory) list.add(Breach(a, 'Memory', a.memory, thresholds.memory));
      if (a.disk >= thresholds.disk) list.add(Breach(a, 'Disk', a.disk, thresholds.disk));
    }
    breaches = list;
  }

  void _evaluateAlarm() {
    final current = breaches.map((b) => b.key).toSet();
    // Forget acknowledgements for breaches that have resolved (so they can alarm again).
    _acked.removeWhere((k) => !current.contains(k));

    final hasUnacked = breaches.any((b) => !_acked.contains(b.key));
    if (hasUnacked && !alarming) {
      alarming = true;
      AlarmService.instance.start();
    } else if (!hasUnacked && alarming) {
      alarming = false;
      AlarmService.instance.stop();
    }
  }

  /// Silence the current alarm (local ack). It re-alarms only for NEW breaches.
  void acknowledge() {
    _acked.addAll(breaches.map((b) => b.key));
    alarming = false;
    AlarmService.instance.stop();
    notifyListeners();
  }

  @override
  void dispose() {
    stop();
    AlarmService.instance.stop();
    super.dispose();
  }
}
