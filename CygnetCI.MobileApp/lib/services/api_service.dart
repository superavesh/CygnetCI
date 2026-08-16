import 'package:dio/dio.dart';
import '../models/agent_metric.dart';
import 'secure_store.dart';

class ApiException implements Exception {
  final String message;
  final int? status;
  ApiException(this.message, [this.status]);
  @override
  String toString() => message;
}

/// Thin API client for the CygnetCI backend. Reads base URL + token from storage.
class ApiService {
  Dio? _dio;

  Future<Dio> _client() async {
    final baseUrl = await SecureStore.getBaseUrl();
    final token = await SecureStore.getToken();
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      headers: {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
    ));
    return _dio!;
  }

  Future<String> login(String username, String password) async {
    final baseUrl = await SecureStore.getBaseUrl();
    final dio = Dio(BaseOptions(baseUrl: baseUrl, connectTimeout: const Duration(seconds: 15)));
    try {
      final res = await dio.post('/auth/login', data: {'username': username, 'password': password});
      final token = res.data['access_token'] as String?;
      if (token == null) throw ApiException('No token returned');
      await SecureStore.saveToken(token);
      return token;
    } on DioException catch (e) {
      throw ApiException(_msg(e, 'Login failed'), e.response?.statusCode);
    }
  }

  Future<void> logout() async {
    try {
      final dio = await _client();
      await dio.post('/auth/logout');
    } catch (_) {
      /* best effort */
    }
    await SecureStore.clearToken();
  }

  Future<Thresholds> getThresholds() async {
    final dio = await _client();
    try {
      final res = await dio.get('/settings/alert-thresholds');
      return Thresholds.fromJson(Map<String, dynamic>.from(res.data));
    } on DioException catch (e) {
      throw ApiException(_msg(e, 'Failed to load thresholds'), e.response?.statusCode);
    }
  }

  Future<List<AgentMetric>> getMetrics() async {
    final dio = await _client();
    try {
      final res = await dio.get('/monitoring/agents/metrics');
      final list = (res.data as List).cast<Map<String, dynamic>>();
      return list.map(AgentMetric.fromJson).toList();
    } on DioException catch (e) {
      throw ApiException(_msg(e, 'Failed to load metrics'), e.response?.statusCode);
    }
  }

  String _msg(DioException e, String fallback) {
    final data = e.response?.data;
    if (data is Map && data['detail'] != null) return data['detail'].toString();
    return e.message ?? fallback;
  }
}
