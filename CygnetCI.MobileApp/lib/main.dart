import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/login_screen.dart';
import 'screens/overview_screen.dart';
import 'services/background_service.dart';
import 'services/monitoring_controller.dart';
import 'services/secure_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await BackgroundMonitor.initialize();
  final token = await SecureStore.getToken();
  runApp(CygnetApp(loggedIn: token != null));
}

class CygnetApp extends StatelessWidget {
  final bool loggedIn;
  const CygnetApp({super.key, required this.loggedIn});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => MonitoringController(),
      child: MaterialApp(
        title: 'CygnetCI',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(colorSchemeSeed: const Color(0xFF4F46E5), useMaterial3: true),
        home: loggedIn ? const OverviewScreen() : const LoginScreen(),
      ),
    );
  }
}
