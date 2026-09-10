import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cygnetci_mobile/models/agent_metric.dart';
import 'package:cygnetci_mobile/services/api_service.dart';
import 'package:cygnetci_mobile/services/monitoring_controller.dart';

import '../fakes/fake_api_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // AlarmService.instance lazily constructs an AudioPlayer on first access,
  // whose constructor (inside the audioplayers package) kicks off an
  // unawaited platform-channel init. With no real plugin registered in the
  // test environment that init fails asynchronously, outside the reach of
  // any try/catch in our own code. Mocking the channel so it succeeds is the
  // standard fix for this class of "plugin does unawaited work in its own
  // constructor" issue — it isn't working around a bug in our code.
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(const MethodChannel('xyz.luan/audioplayers.global'), (call) async => null);

  group('MonitoringController.poll', () {
    test('no breaches when all agents are within thresholds', () async {
      final api = FakeApiService(
        thresholds: const Thresholds(cpu: 90, memory: 90, disk: 90),
        metrics: [agent(cpu: 10, memory: 10, disk: 10)],
      );
      final controller = MonitoringController(api: api);

      await controller.poll();

      expect(controller.error, isNull);
      expect(controller.breaches, isEmpty);
      expect(controller.alarming, isFalse);
      expect(controller.loading, isFalse);

      controller.dispose();
    });

    test('detects a breach and starts alarming', () async {
      final api = FakeApiService(
        thresholds: const Thresholds(cpu: 90, memory: 90, disk: 90),
        metrics: [agent(id: 1, name: 'db-1', cpu: 95, memory: 10, disk: 10)],
      );
      final controller = MonitoringController(api: api);

      await controller.poll();

      expect(controller.breaches, hasLength(1));
      expect(controller.breaches.first.metric, 'CPU');
      expect(controller.breaches.first.agent.name, 'db-1');
      expect(controller.alarming, isTrue);

      controller.dispose();
    });

    test('a value exactly at the threshold counts as a breach', () async {
      final api = FakeApiService(
        thresholds: const Thresholds(cpu: 90, memory: 90, disk: 90),
        metrics: [agent(cpu: 90)],
      );
      final controller = MonitoringController(api: api);

      await controller.poll();

      expect(controller.breaches, hasLength(1));

      controller.dispose();
    });

    test('offline agents are never flagged as a breach, even over threshold', () async {
      final api = FakeApiService(
        thresholds: const Thresholds(cpu: 90, memory: 90, disk: 90),
        metrics: [agent(status: 'offline', cpu: 99, memory: 99, disk: 99)],
      );
      final controller = MonitoringController(api: api);

      await controller.poll();

      expect(controller.breaches, isEmpty);
      expect(controller.alarming, isFalse);

      controller.dispose();
    });

    test('multiple breaches across multiple agents are all reported', () async {
      final api = FakeApiService(
        thresholds: const Thresholds(cpu: 90, memory: 90, disk: 90),
        metrics: [
          agent(id: 1, name: 'a1', cpu: 95),
          agent(id: 2, name: 'a2', memory: 95, disk: 95),
        ],
      );
      final controller = MonitoringController(api: api);

      await controller.poll();

      expect(controller.breaches, hasLength(3));

      controller.dispose();
    });

    test('breach resolves on a later poll and alarm stops', () async {
      final api = FakeApiService(
        thresholds: const Thresholds(cpu: 90, memory: 90, disk: 90),
        metrics: [agent(cpu: 95)],
      );
      final controller = MonitoringController(api: api);

      await controller.poll();
      expect(controller.alarming, isTrue);

      api.metrics = [agent(cpu: 10)];
      await controller.poll();

      expect(controller.breaches, isEmpty);
      expect(controller.alarming, isFalse);

      controller.dispose();
    });

    test('a 401 marks the session expired and stops polling', () async {
      final api = FakeApiService(thresholdsError: ApiException('unauthorized', 401));
      final controller = MonitoringController(api: api);

      await controller.poll();

      expect(controller.sessionExpired, isTrue);
      expect(controller.error, 'unauthorized');

      controller.dispose();
    });

    test('a non-401 API error is surfaced without marking the session expired', () async {
      final api = FakeApiService(metricsError: ApiException('server error', 500));
      final controller = MonitoringController(api: api);

      await controller.poll();

      expect(controller.sessionExpired, isFalse);
      expect(controller.error, 'server error');

      controller.dispose();
    });

    test('an unexpected exception is caught and surfaced as an error, not rethrown', () async {
      final api = FakeApiService(metricsError: StateError('boom'));
      final controller = MonitoringController(api: api);

      await controller.poll(); // must not throw

      expect(controller.error, contains('boom'));
      expect(controller.loading, isFalse);

      controller.dispose();
    });
  });

  group('MonitoringController.acknowledge', () {
    test('silences the alarm without clearing the breach list', () async {
      final api = FakeApiService(
        thresholds: const Thresholds(cpu: 90, memory: 90, disk: 90),
        metrics: [agent(cpu: 95)],
      );
      final controller = MonitoringController(api: api);
      await controller.poll();
      expect(controller.alarming, isTrue);

      controller.acknowledge();

      expect(controller.alarming, isFalse);
      expect(controller.breaches, hasLength(1)); // still shown, just silenced

      controller.dispose();
    });

    test('an acknowledged breach does not re-alarm while still present', () async {
      final api = FakeApiService(
        thresholds: const Thresholds(cpu: 90, memory: 90, disk: 90),
        metrics: [agent(cpu: 95)],
      );
      final controller = MonitoringController(api: api);
      await controller.poll();
      controller.acknowledge();

      await controller.poll(); // same breach still present

      expect(controller.alarming, isFalse);

      controller.dispose();
    });

    test('a NEW breach re-alarms even if a different one was already acknowledged', () async {
      final api = FakeApiService(
        thresholds: const Thresholds(cpu: 90, memory: 90, disk: 90),
        metrics: [agent(id: 1, name: 'a1', cpu: 95)],
      );
      final controller = MonitoringController(api: api);
      await controller.poll();
      controller.acknowledge();

      api.metrics = [agent(id: 2, name: 'a2', memory: 95)];
      await controller.poll();

      expect(controller.alarming, isTrue);

      controller.dispose();
    });

    test('once a breach resolves and reoccurs, it can alarm again', () async {
      final api = FakeApiService(
        thresholds: const Thresholds(cpu: 90, memory: 90, disk: 90),
        metrics: [agent(cpu: 95)],
      );
      final controller = MonitoringController(api: api);
      await controller.poll();
      controller.acknowledge();

      api.metrics = [agent(cpu: 10)]; // resolved
      await controller.poll();
      expect(controller.alarming, isFalse);

      api.metrics = [agent(cpu: 95)]; // reoccurs
      await controller.poll();
      expect(controller.alarming, isTrue);

      controller.dispose();
    });
  });
}
