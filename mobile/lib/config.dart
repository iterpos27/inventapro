class AppConfig {
  static const defaultApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://inventapro.up.railway.app/api/v1',
  );

  static String normalizeApiBaseUrl(String value) {
    final raw = value.trim().replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(raw);
    if (uri == null || uri.scheme != 'http' || _isLocalHost(uri.host)) {
      return raw;
    }
    return uri.replace(scheme: 'https').toString();
  }

  static bool _isLocalHost(String host) {
    if (host == 'localhost' || host == '::1' || host.startsWith('127.')) {
      return true;
    }
    if (host.startsWith('10.') || host.startsWith('192.168.')) {
      return true;
    }
    final parts = host.split('.');
    if (parts.length == 4 && parts.first == '172') {
      final second = int.tryParse(parts[1]);
      return second != null && second >= 16 && second <= 31;
    }
    return false;
  }
}
