import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../api_client.dart';
import '../app_theme.dart';
import '../models.dart';
import '../widgets/api_settings.dart';
import '../widgets/common_widgets.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.api,
    required this.branding,
    required this.apiBaseUrl,
    required this.onApiBaseUrlChanged,
    required this.onLogin,
  });

  final ApiClient api;
  final BrandingConfig branding;
  final String apiBaseUrl;
  final Future<void> Function(String value) onApiBaseUrlChanged;
  final Future<void> Function(CountSession session) onLogin;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final apiCtrl = TextEditingController(text: widget.apiBaseUrl);
  final userCtrl = TextEditingController();
  final passCtrl = TextEditingController();
  bool loading = false;

  @override
  void dispose() {
    apiCtrl.dispose();
    userCtrl.dispose();
    passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final apiUrl = apiCtrl.text.trim();
    if (apiUrl.isEmpty) {
      _toast('La URL del servidor es requerida', warning: true);
      return;
    }
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
      _toast('La URL debe comenzar con http:// o https://', warning: true);
      return;
    }

    setState(() => loading = true);
    try {
      await widget.onApiBaseUrlChanged(apiUrl);
      final session = await widget.api.login(
        userCtrl.text.trim(),
        passCtrl.text,
      );
      await widget.onLogin(session);
    } catch (err) {
      _toast('$err', warning: false);
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  void _toast(String message, {bool warning = true}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: warning ? appWarning : appRed,
        content: Text(message),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final branding = widget.branding;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: CardBox(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 12),
                    Center(child: BrandMark(branding: branding)),
                    const SizedBox(height: 22),
                    Text(
                      branding.brandName.toUpperCase(),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: appBlue,
                        fontSize: 19,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      branding.brandSubtitle,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: appBlue,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Ingrese sus credenciales',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.black54),
                    ),
                    const SizedBox(height: 18),
                    if (kDebugMode) ...[
                      TextField(
                        controller: apiCtrl,
                        keyboardType: TextInputType.url,
                        style: const TextStyle(fontSize: 13),
                        decoration: const InputDecoration(
                          labelText: 'URL del servidor',
                          prefixIcon: Icon(Icons.link, color: appPrimary),
                        ),
                      ),
                      const SizedBox(height: 12),
                      ApiSettingsTile(
                        apiBaseUrl: apiCtrl.text.trim(),
                        onChanged: (value) async {
                          apiCtrl.text = value;
                          await widget.onApiBaseUrlChanged(value);
                          if (mounted) {
                            setState(() {});
                          }
                        },
                      ),
                      const SizedBox(height: 16),
                    ],
                    TextField(
                      controller: userCtrl,
                      style: const TextStyle(fontSize: 13),
                      decoration: const InputDecoration(
                        labelText: 'Usuario',
                        prefixIcon: Icon(
                          Icons.person_outline,
                          color: appPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: passCtrl,
                      obscureText: true,
                      style: const TextStyle(fontSize: 13),
                      decoration: const InputDecoration(
                        labelText: 'Contrasena',
                        prefixIcon: Icon(Icons.lock_outline, color: appPrimary),
                      ),
                      onSubmitted: (_) => _login(),
                    ),
                    const SizedBox(height: 22),
                    FilledButton(
                      onPressed: loading ? null : _login,
                      style: FilledButton.styleFrom(
                        backgroundColor: appPrimary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            if (loading)
                              const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2,
                                ),
                              )
                            else ...[
                              const Icon(Icons.login, size: 18),
                              const SizedBox(width: 8),
                            ],
                            Text(loading ? 'Ingresando...' : 'Ingresar'),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
