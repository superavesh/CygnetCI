import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/agent_metric.dart';
import '../services/api_service.dart';
import '../services/background_service.dart';
import '../services/monitoring_controller.dart';
import 'alarm_screen.dart';
import 'login_screen.dart';

class OverviewScreen extends StatefulWidget {
  const OverviewScreen({super.key});
  @override
  State<OverviewScreen> createState() => _OverviewScreenState();
}

class _OverviewScreenState extends State<OverviewScreen> {
  bool _backgroundOn = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MonitoringController>().start();
    });
  }

  Future<void> _logout() async {
    context.read<MonitoringController>().stop();
    await BackgroundMonitor.stop();
    await ApiService().logout();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen()));
  }

  Future<void> _toggleBackground(bool on) async {
    setState(() => _backgroundOn = on);
    if (on) {
      await BackgroundMonitor.start();
    } else {
      await BackgroundMonitor.stop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<MonitoringController>(
      builder: (context, ctrl, _) {
        if (ctrl.sessionExpired) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen()));
          });
        }

        return Stack(
          children: [
            Scaffold(
              appBar: AppBar(
                title: const Text('CygnetCI Monitoring'),
                actions: [
                  IconButton(
                    onPressed: ctrl.loading ? null : ctrl.poll,
                    icon: const Icon(Icons.refresh),
                  ),
                  IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
                ],
              ),
              body: RefreshIndicator(
                onRefresh: ctrl.poll,
                child: ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    if (Platform.isAndroid)
                      Card(
                        child: SwitchListTile(
                          title: const Text('Background monitoring'),
                          subtitle: const Text('Keep watching when the app is closed'),
                          value: _backgroundOn,
                          onChanged: _toggleBackground,
                        ),
                      ),
                    if (ctrl.error != null)
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text('⚠ ${ctrl.error}', style: TextStyle(color: Colors.red.shade700)),
                      ),
                    if (ctrl.agents.isEmpty && !ctrl.loading)
                      const Padding(
                        padding: EdgeInsets.all(32),
                        child: Center(child: Text('No agents found')),
                      ),
                    ...ctrl.agents.map((a) => _AgentCard(agent: a, thresholds: ctrl.thresholds)),
                  ],
                ),
              ),
            ),
            if (ctrl.alarming)
              Positioned.fill(
                child: AlarmOverlay(breaches: ctrl.breaches, onAcknowledge: ctrl.acknowledge),
              ),
          ],
        );
      },
    );
  }
}

class _AgentCard extends StatelessWidget {
  final AgentMetric agent;
  final Thresholds thresholds;
  const _AgentCard({required this.agent, required this.thresholds});

  @override
  Widget build(BuildContext context) {
    final offline = agent.status == 'offline';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(agent.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                ),
                _StatusChip(status: agent.status),
              ],
            ),
            const SizedBox(height: 10),
            _MetricBar(label: 'CPU', value: agent.cpu, limit: thresholds.cpu, disabled: offline),
            _MetricBar(label: 'Memory', value: agent.memory, limit: thresholds.memory, disabled: offline),
            _MetricBar(label: 'Disk', value: agent.disk, limit: thresholds.disk, disabled: offline),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});
  @override
  Widget build(BuildContext context) {
    final color = status == 'online'
        ? Colors.green
        : status == 'busy'
            ? Colors.orange
            : Colors.grey;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(12)),
      child: Text(status, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12)),
    );
  }
}

class _MetricBar extends StatelessWidget {
  final String label;
  final int value;
  final int limit;
  final bool disabled;
  const _MetricBar({required this.label, required this.value, required this.limit, required this.disabled});

  @override
  Widget build(BuildContext context) {
    final breach = !disabled && value >= limit;
    final color = disabled ? Colors.grey : (breach ? Colors.red : Colors.blue);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SizedBox(width: 64, child: Text(label, style: const TextStyle(fontSize: 13))),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: (value.clamp(0, 100)) / 100,
                    minHeight: 8,
                    backgroundColor: Colors.grey.shade200,
                    color: color,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text('$value%', style: TextStyle(fontWeight: FontWeight.w600, color: color)),
            ],
          ),
        ],
      ),
    );
  }
}
