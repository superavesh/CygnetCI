/// App configuration. Set the API base URL for your environment.
/// (Users can override it at runtime on the login screen.)
class AppConfig {
  /// Default API base URL — the phone-reachable HTTPS address of the CygnetCI API.
  static const String defaultApiBaseUrl = 'https://api.cygnetci.example.com';

  /// How often to poll the API for metrics (seconds).
  static const int pollIntervalSeconds = 30;

  /// SharedPreferences key where the (possibly overridden) base URL is stored.
  static const String prefApiBaseUrl = 'api_base_url';
}
