import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:cygnetci_mobile/models/agent_metric.dart';
import 'package:cygnetci_mobile/screens/overview_screen.dart';
import 'package:cygnetci_mobile/services/monitoring_controller.dart';

import '../fakes/fake_api_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // See test/services/monitoring_controller_test.dart for why this is needed —
  // AudioPlayer's constructor (inside the audioplayers package) does
  // unawaited platform-channel work that MonitoringController's alarm
  // handling can trigger as soon as a breach is detected.
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(const MethodChannel('xyz.luan/audioplayers.global'), (call) async => null);

  Widget wrap(MonitoringController controller) => MaterialApp(
        home: ChangeNotifierProvider.value(
          value: controller,
          child: const OverviewScreen(),
        ),
      );

  testWidgets('shows each agent name once metrics load', (tester) async {
    final api = FakeApiService(metrics: [
      agent(id: 1, name: 'db-server-1', cpu: 20),
      agent(id: 2, name: 'web-server-1', cpu: 30),
    ]);
    final controller = MonitoringController(api: api);

    await tester.pumpWidget(wrap(controller));
    await tester.pump(); // let the post-frame callback fire (start -> poll)
    await tester.pump(); // let the poll's Future resolve

    expect(find.text('db-server-1'), findsOneWidget);
    expect(find.text('web-server-1'), findsOneWidget);
    expect(find.text('No agents found'), findsNothing);

    controller.stop(); // cancel the periodic timer start() scheduled
  });

  testWidgets('shows "No agents found" when the list is empty', (tester) async {
    final api = FakeApiService(metrics: []);
    final controller = MonitoringController(api: api);

    await tester.pumpWidget(wrap(controller));
    await tester.pump();
    await tester.pump();

    expect(find.text('No agents found'), findsOneWidget);

    controller.stop();
  });

  testWidgets('a breach shows the full-screen alarm overlay', (tester) async {
    final api = FakeApiService(
      thresholds: const Thresholds(cpu: 90, memory: 90, disk: 90),
      metrics: [agent(id: 1, name: 'db-server-1', cpu: 95)],
    );
    final controller = MonitoringController(api: api);

    await tester.pumpWidget(wrap(controller));
    await tester.pump();
    await tester.pump();

    expect(find.text('CRITICAL ALERT'), findsOneWidget);
    expect(find.text('1 threshold breach(es)'), findsOneWidget);

    // Acknowledging dismisses the overlay.
    await tester.tap(find.text('ACKNOWLEDGE'));
    await tester.pump();

    expect(find.text('CRITICAL ALERT'), findsNothing);

    controller.stop();
  });

  testWidgets('an API error is shown inline without crashing the page', (tester) async {
    final api = FakeApiService(metricsError: Exception('network down'));
    final controller = MonitoringController(api: api);

    await tester.pumpWidget(wrap(controller));
    await tester.pump();
    await tester.pump();

    expect(find.textContaining('network down'), findsOneWidget);

    controller.stop();
  });
}
