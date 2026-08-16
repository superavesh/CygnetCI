import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../services/secure_store.dart';
import 'overview_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  final _baseUrl = TextEditingController();
  final _api = ApiService();
  bool _loading = false;
  bool _showAdvanced = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    SecureStore.getBaseUrl().then((v) => setState(() => _baseUrl.text = v));
  }

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      if (_baseUrl.text.trim().isNotEmpty) {
        await SecureStore.setBaseUrl(_baseUrl.text.trim());
      }
      await _api.login(_username.text.trim(), _password.text);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const OverviewScreen()),
      );
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.shield_outlined, size: 64, color: Color(0xFF4F46E5)),
                const SizedBox(height: 12),
                const Text('CygnetCI', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                const Text('Monitoring & Alerts', style: TextStyle(color: Colors.grey)),
                const SizedBox(height: 24),
                if (_error != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Text(_error!, style: TextStyle(color: Colors.red.shade700)),
                  ),
                TextField(
                  controller: _username,
                  decoration: const InputDecoration(labelText: 'Username', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: true,
                  onSubmitted: (_) => _login(),
                  decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => setState(() => _showAdvanced = !_showAdvanced),
                    child: Text(_showAdvanced ? 'Hide server URL' : 'Server URL'),
                  ),
                ),
                if (_showAdvanced)
                  TextField(
                    controller: _baseUrl,
                    decoration: const InputDecoration(
                      labelText: 'API base URL',
                      hintText: 'https://api.cygnetci.example.com',
                      border: OutlineInputBorder(),
                    ),
                  ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _loading ? null : _login,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: _loading
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Sign in'),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
