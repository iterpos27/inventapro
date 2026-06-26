import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'api_client.dart';
import 'config.dart';
import 'local_store.dart';
import 'models.dart';
import 'screens/login_screen.dart';
import 'screens/operation_home.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  late final ApiClient api;
  final store = LocalStore();
  CountSession? session;
  BrandingConfig branding = BrandingConfig.fallback;
  String apiBaseUrl = AppConfig.defaultApiBaseUrl;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    api = ApiClient(onUnauthorized: _handleUnauthorized);
    _restore();
  }

  Future<void> _handleUnauthorized() async {
    await store.clearSession();
    api.token = null;
    if (mounted) {
      setState(() => session = null);
    }
  }

  Future<void> _restore() async {
    final savedApiBaseUrl = kDebugMode ? await store.readApiBaseUrl() : null;
    final configuredApiBaseUrl = savedApiBaseUrl ?? AppConfig.defaultApiBaseUrl;
    api.setApiBaseUrl(configuredApiBaseUrl);
    if (!kDebugMode) {
      await store.saveApiBaseUrl(api.apiBaseUrl);
    }

    final saved = await store.readSession();
    final savedBranding = await store.readBranding();
    api.token = saved?.token;
    if (savedBranding != null) {
      branding = savedBranding;
    }

    try {
      final freshBranding = await api.branding();
      branding = freshBranding;
      await store.saveBranding(freshBranding);
    } catch (_) {
      // Mantener branding en cache cuando no hay red.
    }

    if (!mounted) {
      return;
    }
    setState(() {
      apiBaseUrl = api.apiBaseUrl;
      session = saved;
      loading = false;
    });
  }

  Future<void> _saveApiBaseUrl(String value) async {
    final clean = AppConfig.normalizeApiBaseUrl(value);
    final serverChanged = clean != api.apiBaseUrl;
    await store.saveApiBaseUrl(clean);
    api.setApiBaseUrl(clean);
    if (serverChanged && session != null) {
      await _handleUnauthorized();
    }
    if (mounted) {
      setState(() => apiBaseUrl = clean);
    }
  }

  Future<void> _setSession(CountSession next) async {
    await store.saveSession(next);
    api.token = next.token;
    if (mounted) {
      setState(() => session = next);
    }
  }

  Future<void> _logout() async {
    try {
      await api.logout();
    } finally {
      await store.clearSession();
      api.token = null;
      if (mounted) {
        setState(() => session = null);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (session == null) {
      return LoginScreen(
        api: api,
        branding: branding,
        apiBaseUrl: apiBaseUrl,
        onApiBaseUrlChanged: _saveApiBaseUrl,
        onLogin: _setSession,
      );
    }
    return OperationHome(
      api: api,
      store: store,
      user: session!.user,
      branding: branding,
      apiBaseUrl: apiBaseUrl,
      onApiBaseUrlChanged: _saveApiBaseUrl,
      onLogout: _logout,
    );
  }
}
