import 'package:flutter/material.dart';
import '../models/agent_metric.dart';

/// Full-screen critical alarm overlay shown while alarming.
class AlarmOverlay extends StatelessWidget {
  final List<Breach> breaches;
  final VoidCallback onAcknowledge;
  const AlarmOverlay({super.key, required this.breaches, required this.onAcknowledge});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFDC2626),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 88),
              const SizedBox(height: 12),
              const Text('CRITICAL ALERT',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: 1)),
              const SizedBox(height: 6),
              Text('${breaches.length} threshold breach(es)',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70, fontSize: 15)),
              const SizedBox(height: 20),
              Expanded(
                child: ListView.separated(
                  itemCount: breaches.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final b = breaches[i];
                    return Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.white24),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.dns_outlined, color: Colors.white),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(b.agent.name,
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                                Text('${b.metric}: ${b.value}%  (limit ${b.threshold}%)',
                                    style: const TextStyle(color: Colors.white70)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 60,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: const Color(0xFFDC2626),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: onAcknowledge,
                  child: const Text('ACKNOWLEDGE',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: 1)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
