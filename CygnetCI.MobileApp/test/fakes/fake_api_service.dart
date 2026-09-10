import 'package:cygnetci_mobile/models/agent_metric.dart';
import 'package:cygnetci_mobile/services/api_service.dart';

/// Test double for ApiService — overrides only the two methods
/// MonitoringController calls, so tests never touch Dio, SecureStore, or any
/// platform channel. Exercised via MonitoringController's optional
/// constructor injection point (MonitoringController({ApiService? api})).
class FakeApiService extends ApiService {
  FakeApiService({
    this.thresholds = const Thresholds(),
    this.metrics = const [],
    this.thresholdsError,
    this.metricsError,
  });

  Thresholds thresholds;
  List<AgentMetric> metrics;
  Object? thresholdsError;
  Object? metricsError;

  int getThresholdsCallCount = 0;
  int getMetricsCallCount = 0;

  @override
  Future<Thresholds> getThresholds() async {
    getThresholdsCallCount++;
    if (thresholdsError != null) throw thresholdsError!;
    return thresholds;
  }

  @override
  Future<List<AgentMetric>> getMetrics() async {
    getMetricsCallCount++;
    if (metricsError != null) throw metricsError!;
    return metrics;
  }
}

AgentMetric agent({
  int id = 1,
  String name = 'agent-1',
  String status = 'online',
  int cpu = 10,
  int memory = 10,
  int disk = 10,
}) =>
    AgentMetric(id: id, name: name, status: status, cpu: cpu, memory: memory, disk: disk);
