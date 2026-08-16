class AgentMetric {
  final int id;
  final String name;
  final String status;
  final int cpu;
  final int memory;
  final int disk;
  final String? lastSeen;

  AgentMetric({
    required this.id,
    required this.name,
    required this.status,
    required this.cpu,
    required this.memory,
    required this.disk,
    this.lastSeen,
  });

  factory AgentMetric.fromJson(Map<String, dynamic> j) => AgentMetric(
        id: (j['id'] ?? 0) as int,
        name: (j['name'] ?? '') as String,
        status: (j['status'] ?? 'unknown') as String,
        cpu: _toInt(j['cpu']),
        memory: _toInt(j['memory']),
        disk: _toInt(j['disk']),
        lastSeen: j['last_seen'] as String?,
      );

  static int _toInt(dynamic v) => v is num ? v.round() : int.tryParse('$v') ?? 0;
}

class Thresholds {
  final int cpu;
  final int memory;
  final int disk;
  const Thresholds({this.cpu = 90, this.memory = 90, this.disk = 90});

  factory Thresholds.fromJson(Map<String, dynamic> j) => Thresholds(
        cpu: AgentMetric._toInt(j['cpu'] ?? 90),
        memory: AgentMetric._toInt(j['memory'] ?? 90),
        disk: AgentMetric._toInt(j['disk'] ?? 90),
      );
}

/// A detected breach of a threshold on one agent.
class Breach {
  final AgentMetric agent;
  final String metric; // CPU | Memory | Disk
  final int value;
  final int threshold;
  Breach(this.agent, this.metric, this.value, this.threshold);

  String get key => '${agent.id}:$metric';
  String get label => '${agent.name}: $metric $value% (limit $threshold%)';
}
