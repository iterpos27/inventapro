import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'api_client.dart';
import 'config.dart';
import 'local_store.dart';
import 'models.dart';

void main() {
  runApp(const InventaProApp());
}

const _blue = Color(0xff003f7f);
const _primary = Color(0xff2364a5);
const _green = Color(0xff168555);
const _red = Color(0xffe63946);
const _bg = Color(0xfff3f8ff);
const _border = Color(0xffb9d7f4);

class InventaProApp extends StatelessWidget {
  const InventaProApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'InventaPro',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: _bg,
        colorScheme: ColorScheme.fromSeed(seedColor: _primary),
        fontFamily: 'Arial',
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(6)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: _border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: _primary, width: 1.5),
          ),
        ),
      ),
      home: const AppShell(),
    );
  }
}

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
    setState(() => session = next);
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
        backgroundColor: warning ? const Color(0xffd99a00) : _red,
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
                    Center(
                      child: Container(
                        width: 76,
                        height: 76,
                        decoration: BoxDecoration(
                          color: _primary,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: branding.brandLogoUrl.trim().isNotEmpty
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.network(
                                  branding.brandLogoUrl.trim(),
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, error, stackTrace) => Center(
                                    child: Text(
                                      branding.brandAbbreviation,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 20,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                ),
                              )
                            : Center(
                                child: Text(
                                  branding.brandAbbreviation,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                      ),
                    ),
                    const SizedBox(height: 22),
                    Text(
                      branding.brandName.toUpperCase(),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: _blue,
                        fontSize: 19,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      branding.brandSubtitle,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: _blue,
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
                          prefixIcon: Icon(Icons.link, color: _primary),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    TextField(
                      controller: userCtrl,
                      style: const TextStyle(fontSize: 13),
                      decoration: const InputDecoration(
                        labelText: 'Usuario',
                        prefixIcon: Icon(Icons.person_outline, color: _primary),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: passCtrl,
                      obscureText: true,
                      style: const TextStyle(fontSize: 13),
                      decoration: const InputDecoration(
                        labelText: 'Contrasena',
                        prefixIcon: Icon(Icons.lock_outline, color: _primary),
                      ),
                      onSubmitted: (_) => _login(),
                    ),
                    const SizedBox(height: 22),
                    FilledButton(
                      onPressed: loading ? null : _login,
                      style: FilledButton.styleFrom(
                        backgroundColor: _primary,
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

class OperationHome extends StatefulWidget {
  const OperationHome({
    super.key,
    required this.api,
    required this.store,
    required this.user,
    required this.branding,
    required this.apiBaseUrl,
    required this.onApiBaseUrlChanged,
    required this.onLogout,
  });

  final ApiClient api;
  final LocalStore store;
  final SessionUser user;
  final BrandingConfig branding;
  final String apiBaseUrl;
  final Future<void> Function(String value) onApiBaseUrlChanged;
  final Future<void> Function() onLogout;

  @override
  State<OperationHome> createState() => _OperationHomeState();
}

class _OperationHomeState extends State<OperationHome>
    with WidgetsBindingObserver {
  List<Toma> tomas = [];
  List<CountHistory> history = [];
  ConteoInfo? conteo;
  List<CountItem> items = [];
  List<Product> results = [];
  final searchCtrl = TextEditingController();
  final searchFocus = FocusNode();
  final Map<int, FocusNode> qtyFocusNodes = {};
  Timer? searchTimer;
  Timer? autoSaveTimer;
  StreamSubscription<List<ConnectivityResult>>? connectivitySub;
  bool loading = true;
  bool saving = false;
  String saveStatus = 'Sin cambios recientes.';
  bool _hasUnsavedChanges = false;
  bool _syncScheduled = false;
  SyncDraftJob? pendingSyncJob;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    connectivitySub = Connectivity().onConnectivityChanged.listen((results) {
      final hasNetwork = !results.contains(ConnectivityResult.none);
      if (hasNetwork) {
        _scheduleDraftSync();
      }
    });
    _loadTomas();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    searchTimer?.cancel();
    autoSaveTimer?.cancel();
    connectivitySub?.cancel();
    searchCtrl.dispose();
    searchFocus.dispose();
    for (final node in qtyFocusNodes.values) {
      node.dispose();
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _scheduleDraftSync();
    }
  }

  Future<void> _loadTomas() async {
    setState(() => loading = true);
    try {
      final data = await widget.api.tomas();
      final historyData = await widget.api.historial();
      setState(() {
        tomas = data;
        history = historyData;
      });
    } catch (err) {
      if (err is ApiException && err.statusCode == 401) return;
      _toast('$err', isError: true);
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  Future<void> _openToma(Toma toma) async {
    setState(() => loading = true);
    try {
      final conteoId =
          toma.conteoId ?? await widget.api.iniciarConteo(toma.tomaId);
      final detail = await widget.api.detalleConteo(conteoId, toma);
      final localDraft = await widget.store.readDraft(conteoId);
      final syncJob = await widget.store.readSyncJob(conteoId);
      setState(() {
        conteo = detail.conteo.copyWith(version: localDraft?.version);
        items = syncJob?.items ?? localDraft?.items ?? detail.items;
        results = [];
        searchCtrl.clear();
        pendingSyncJob = syncJob;
        _hasUnsavedChanges = localDraft != null || syncJob != null;
        saveStatus = _resolveSyncStatus(syncJob, localDraft != null);
      });
      _startPeriodicAutoSave();
      _scheduleDraftSync();
    } catch (err) {
      _toast('$err', isError: true);
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  Future<void> _search(String value) async {
    searchTimer?.cancel();
    final term = value.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();
    if (term.length < 3) {
      setState(() => results = []);
      return;
    }
    searchTimer = Timer(const Duration(milliseconds: 450), () async {
      final cached = await widget.store.readSearch(term);
      if (cached != null) {
        if (mounted) {
          Product? exactMatch;
          for (final p in cached) {
            if (p.codigo.trim().toLowerCase() == term) {
              exactMatch = p;
              break;
            }
          }
          if (exactMatch != null) {
            _addOrIncrementProduct(exactMatch);
          } else {
            setState(() => results = cached);
          }
        }
        return;
      }
      try {
        final data = await widget.api.searchProducts(term);
        await widget.store.saveSearch(term, data);
        if (mounted) {
          Product? exactMatch;
          for (final p in data) {
            if (p.codigo.trim().toLowerCase() == term) {
              exactMatch = p;
              break;
            }
          }
          if (exactMatch != null) {
            _addOrIncrementProduct(exactMatch);
          } else {
            setState(() => results = data);
          }
        }
      } catch (err) {
        _toast('$err', isError: true);
      }
    });
  }

  Future<void> _handleSearchSubmit(String value) async {
    searchTimer?.cancel();
    final term = value.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();
    if (term.isEmpty) return;

    setState(() => loading = true);
    try {
      final data = await widget.api.searchProducts(term);
      if (mounted) {
        Product? exactMatch;
        for (final p in data) {
          if (p.codigo.trim().toLowerCase() == term) {
            exactMatch = p;
            break;
          }
        }
        if (exactMatch == null && data.length == 1) {
          exactMatch = data.first;
        }

        if (exactMatch != null) {
          _addOrIncrementProduct(exactMatch);
        } else {
          setState(() {
            results = data;
          });
          if (data.isEmpty) {
            _toast('No se encontraron productos.', isWarning: true);
          }
        }
      }
    } catch (err) {
      _toast('$err', isError: true);
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  void _addOrIncrementProduct(Product product) {
    final index = items.indexWhere((item) => item.productoId == product.id);
    qtyFocusNodes.putIfAbsent(product.id, FocusNode.new);
    setState(() {
      if (index != -1) {
        _toast(
          'Producto duplicado. Cambie la cantidad si necesita ajustar.',
          isWarning: true,
        );
      } else {
        items = [
          CountItem(
            productoId: product.id,
            codigo: product.codigo,
            descripcion: product.descripcion,
            cantidad: 0,
          ),
          ...items,
        ];
        saveStatus = 'Cambios pendientes...';
        _hasUnsavedChanges = true;
      }
      results = [];
      searchCtrl.clear();
    });
    if (index == -1) {
      _persistLocalDraft();
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final qtyFocus = qtyFocusNodes[product.id];
      if (qtyFocus != null && qtyFocus.canRequestFocus) {
        qtyFocus.requestFocus();
      }
    });
  }

  void _updateQty(int productoId, String value) {
    final qty = double.tryParse(value.replaceAll(',', '.')) ?? 0;
    setState(() {
      items = items
          .map(
            (item) => item.productoId == productoId
                ? item.copyWith(cantidad: qty)
                : item,
          )
          .toList();
      saveStatus = 'Cambios pendientes...';
      _hasUnsavedChanges = true;
    });
    _persistLocalDraft();
  }

  void _removeItem(int productoId) {
    setState(() {
      items = items.where((item) => item.productoId != productoId).toList();
      saveStatus = 'Cambios pendientes...';
      _hasUnsavedChanges = true;
    });
    qtyFocusNodes.remove(productoId)?.dispose();
    _persistLocalDraft();
  }

  List<CountItem> get validItems =>
      items.where((item) => item.cantidad > 0).toList();

  Future<void> _persistLocalDraft() async {
    final current = conteo;
    if (current == null) {
      return;
    }
    await widget.store.saveDraft(current.id, current.version, items);
    final job = SyncDraftJob(
      conteoId: current.id,
      version: current.version,
      items: validItems,
      status: 'pending',
      updatedAt: DateTime.now().toIso8601String(),
    );
    await widget.store.saveSyncJob(job);
    if (mounted) {
      setState(() => pendingSyncJob = job);
    }
  }

  void _startPeriodicAutoSave() {
    autoSaveTimer?.cancel();
    autoSaveTimer = Timer.periodic(const Duration(minutes: 3), (timer) {
      _scheduleDraftSync();
    });
  }

  void _scheduleDraftSync() {
    if (_syncScheduled) {
      return;
    }
    if (!_hasUnsavedChanges || conteo == null || validItems.isEmpty || saving) {
      return;
    }
    _syncScheduled = true;
    Future<void>.delayed(const Duration(milliseconds: 250), () async {
      _syncScheduled = false;
      if (!mounted) {
        return;
      }
      if (_hasUnsavedChanges && conteo != null && validItems.isNotEmpty && !saving) {
        await _saveDraft(silent: true);
      }
    });
  }

  Future<void> _openScanner() async {
    if (conteo == null || loading || saving) {
      return;
    }
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
    );
    if (!mounted || code == null || code.trim().isEmpty) {
      return;
    }
    searchCtrl.text = code.trim();
    await _handleSearchSubmit(code.trim());
  }

  Future<void> _saveDraft({bool silent = false}) async {
    final current = conteo;
    if (current == null || validItems.isEmpty || saving) {
      return;
    }
    setState(() {
      saving = true;
      saveStatus = 'Guardando borrador...';
    });
    try {
      final version = await widget.api.guardarBorrador(
        current.id,
        current.version,
        validItems,
      );
      await widget.store.clearDraft(current.id);
      await widget.store.clearSyncJob(current.id);
      setState(() {
        conteo = current.copyWith(version: version);
        pendingSyncJob = null;
        saveStatus = 'Borrador guardado.';
        _hasUnsavedChanges = false;
      });
      if (!silent) {
        _toast('Borrador guardado.');
      }
    } catch (err) {
      await _persistLocalDraft();
      final failedJob = SyncDraftJob(
        conteoId: current.id,
        version: current.version,
        items: validItems,
        status: 'error',
        updatedAt: DateTime.now().toIso8601String(),
        errorMessage: '$err',
      );
      await widget.store.saveSyncJob(failedJob);
      if (!mounted) return;
      setState(() {
        pendingSyncJob = failedJob;
        saveStatus = 'Borrador local guardado. Pendiente de sincronizar.';
      });
      if (!silent) {
        _toast('$err', isWarning: true);
      }
    } finally {
      if (mounted) {
        setState(() => saving = false);
      }
    }
  }

  Future<void> _finish() async {
    final current = conteo;
    if (current == null || validItems.isEmpty || saving) {
      return;
    }
    setState(() {
      saving = true;
      saveStatus = 'Finalizando conteo...';
    });
    try {
      await widget.api.finalizarConteo(current.id, current.version, validItems);
      await widget.store.clearDraft(current.id);
      await widget.store.clearSyncJob(current.id);
      setState(() {
        conteo = null;
        items = [];
        pendingSyncJob = null;
        saveStatus = 'Sin cambios recientes.';
        _hasUnsavedChanges = false;
      });
      autoSaveTimer?.cancel();
      autoSaveTimer = null;
      await _loadTomas();
      _toast('Conteo finalizado.');
    } catch (err) {
      await _persistLocalDraft();
      _toast('$err', isError: true);
    } finally {
      if (mounted) {
        setState(() => saving = false);
      }
    }
  }

  void _toast(String message, {bool isError = false, bool isWarning = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: isError
            ? _red
            : (isWarning ? const Color(0xffd99a00) : _green),
        content: Text(message),
      ),
    );
  }

  String _title(String raw) {
    final value = raw.trim();
    if (value.toUpperCase().startsWith('TOMA FISICA #')) {
      return value.toUpperCase();
    }
    return 'TOMA FISICA # $value'.toUpperCase();
  }

  String _period(String date, String hour) {
    final cleanDate = date.length >= 10 ? date.substring(0, 10) : date;
    final cleanHour = hour.length >= 5 ? hour.substring(0, 5) : hour;
    return [cleanDate, cleanHour].where((part) => part.isNotEmpty).join(' ');
  }

  String _resolveSyncStatus(SyncDraftJob? job, bool hasDraft) {
    if (job?.status == 'error') {
      return 'Borrador local con error de sincronizacion.';
    }
    if (job != null || hasDraft) {
      return 'Borrador local pendiente de sincronizar.';
    }
    return 'Sin cambios recientes.';
  }

  Future<void> _backToTomaList() async {
    await _persistLocalDraft();
    autoSaveTimer?.cancel();
    autoSaveTimer = null;
    setState(() {
      conteo = null;
      items = [];
      results = [];
      searchCtrl.clear();
      saveStatus = 'Sin cambios recientes.';
      _hasUnsavedChanges = false;
    });
    await _loadTomas();
  }

  @override
  Widget build(BuildContext context) {
    final current = conteo;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        leading: current == null
            ? null
            : IconButton(
                tooltip: 'Volver',
                onPressed: _backToTomaList,
                icon: const Icon(Icons.arrow_back, color: _blue),
              ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.branding.brandName,
              style: const TextStyle(
                color: _blue,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              current == null ? widget.user.nombre : 'Conteo y Borradores',
              style: const TextStyle(
                color: _blue,
                fontSize: 14,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
        actions: [
          if (kDebugMode)
            ApiSettingsIconButton(
              apiBaseUrl: widget.apiBaseUrl,
              onChanged: widget.onApiBaseUrlChanged,
            ),
          IconButton(
            tooltip: 'Salir',
            onPressed: widget.onLogout,
            icon: const Icon(Icons.account_circle_outlined, color: _blue),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : current == null
          ? _buildTomaList()
          : _buildCount(current),
      bottomNavigationBar: (loading || current == null)
          ? null
          : SafeArea(
              child: Container(
                color: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                child: OutlinedButton.icon(
                  onPressed: saving || validItems.isEmpty
                      ? null
                      : () => _saveDraft(),
                  icon: const Icon(Icons.save_outlined),
                  label: const Text('Guardar borrador'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _blue,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(6),
                    ),
                    side: const BorderSide(color: _primary),
                  ),
                ),
              ),
            ),
    );
  }

  Widget _buildTomaList() {
    return RefreshIndicator(
      onRefresh: _loadTomas,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const PageHeading(
            kicker: 'CONTEO FISICO',
            title: 'Seleccionar conteo',
          ),
          const SizedBox(height: 12),
          CardBox(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Conteos disponibles',
                  style: TextStyle(
                    color: _blue,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 12),
                if (tomas.isEmpty)
                  const Text('No hay tomas abiertas asignadas.'),
                ...tomas.map(
                  (toma) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(6),
                      onTap: () => _openToma(toma),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border.all(color: _border),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _title(toma.numeroToma),
                                    style: const TextStyle(
                                      color: _blue,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    'AGENCIA: ${toma.agencia}',
                                    style: const TextStyle(
                                      color: _blue,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  Text(
                                    'HABILITACION: ${_period(toma.fechaHabilitacion, toma.horaInicio)}',
                                    style: const TextStyle(
                                      color: _blue,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  Text(
                                    'FINALIZACION: ${_period(toma.fechaCierre, toma.horaFin)}',
                                    style: const TextStyle(
                                      color: _blue,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    '${toma.lineas} lineas registradas - ${toma.conteoId == null ? 'Empezar' : 'Continuar'}',
                                  ),
                                ],
                              ),
                            ),
                            const Icon(
                              Icons.arrow_circle_right_outlined,
                              color: _blue,
                              size: 28,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          CardBox(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Historial de conteos',
                  style: TextStyle(
                    color: _blue,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 12),
                if (history.isEmpty)
                  const Text('Todavia no hay conteos registrados.'),
                ...history.map(
                  (item) => Container(
                    margin: const EdgeInsets.only(bottom: 9),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: _border),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _title(item.numeroToma),
                          style: const TextStyle(
                            color: _blue,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'AGENCIA: ${item.agencia.isEmpty ? '-' : item.agencia}',
                        ),
                        Text(
                          '${item.estado.toUpperCase()} - ${item.lineas} lineas - ${item.unidades.toStringAsFixed(2)} unidades',
                        ),
                        if (item.fecha.isNotEmpty)
                          Text(
                            item.fecha,
                            style: const TextStyle(
                              color: Colors.black54,
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCount(ConteoInfo current) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        CardBox(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: const [
                  Icon(Icons.play_circle_fill, color: _green, size: 14),
                  SizedBox(width: 6),
                  Text(
                    'OPERACION ACTIVA',
                    style: TextStyle(
                      color: _blue,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                _title(current.numeroToma),
                style: const TextStyle(
                  color: _blue,
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                saveStatus,
                style: const TextStyle(
                  color: Colors.black87,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 10),
              InfoChip(
                icon: Icons.apartment_outlined,
                label: 'Agencia: ${current.agencia}',
              ),
              InfoChip(
                icon: Icons.calendar_month_outlined,
                label:
                    'Habilitacion: ${_period(current.fechaHabilitacion, current.horaInicio)}',
              ),
              InfoChip(
                icon: Icons.event_available_outlined,
                label:
                    'Cierre: ${_period(current.fechaCierre, current.horaFin)}',
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: saving || validItems.isEmpty ? null : _finish,
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Finalizar conteo'),
                style: FilledButton.styleFrom(
                  backgroundColor: _green,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        CardBox(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Buscar producto'),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: searchCtrl,
                      focusNode: searchFocus,
                      style: const TextStyle(fontSize: 13),
                      decoration: const InputDecoration(
                        hintText: 'Codigo o descripcion',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: _search,
                      onSubmitted: _handleSearchSubmit,
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.tonalIcon(
                    onPressed: _openScanner,
                    icon: const Icon(Icons.qr_code_scanner_outlined),
                    label: const Text('Escanear'),
                  ),
                ],
              ),
              if (results.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: _border),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Column(
                    children: results
                        .map(
                          (product) => ListTile(
                            dense: true,
                            title: Text(
                              product.codigo,
                              style: const TextStyle(
                                color: _blue,
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            subtitle: Text(
                              product.descripcion,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 12),
                            ),
                            trailing: const Icon(
                              Icons.add_circle_outline,
                              color: _primary,
                            ),
                            onTap: () => _addOrIncrementProduct(product),
                          ),
                        )
                        .toList(),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        CardBox(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Productos contados',
                      style: TextStyle(
                        color: _blue,
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Chip(
                    label: Text('${items.length}'),
                    backgroundColor: const Color(0xffdcecff),
                    side: BorderSide.none,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (items.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 28),
                  child: Center(
                    child: Text('Agregue productos para iniciar el conteo.'),
                  ),
                ),
              ...items.map((item) {
                final qtyFocus = qtyFocusNodes.putIfAbsent(
                  item.productoId,
                  FocusNode.new,
                );
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: _border),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () => _removeItem(item.productoId),
                        icon: const Icon(Icons.delete_outline, color: _red),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.codigo,
                              style: const TextStyle(
                                color: _blue,
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            Text(
                              item.descripcion,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 78,
                        child: TextFormField(
                          key: ValueKey('${item.productoId}-${item.cantidad}'),
                          focusNode: qtyFocus,
                          style: const TextStyle(fontSize: 13),
                          initialValue: item.cantidad.toStringAsFixed(
                            item.cantidad.truncateToDouble() == item.cantidad
                                ? 0
                                : 2,
                          ),
                          textAlign: TextAlign.center,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: const InputDecoration(
                            contentPadding: EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 10,
                            ),
                          ),
                          onChanged: (value) =>
                              _updateQty(item.productoId, value),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ],
    );
  }
}

class ApiSettingsTile extends StatelessWidget {
  const ApiSettingsTile({
    super.key,
    required this.apiBaseUrl,
    required this.onChanged,
  });

  final String apiBaseUrl;
  final Future<void> Function(String value) onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: () => showApiSettingsDialog(context, apiBaseUrl, onChanged),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xffeef6ff),
          border: Border.all(color: _border),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          children: [
            const Icon(Icons.dns_outlined, color: _primary, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Servidor API',
                    style: TextStyle(color: _blue, fontWeight: FontWeight.w900),
                  ),
                  Text(
                    apiBaseUrl,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.black54, fontSize: 12),
                  ),
                ],
              ),
            ),
            const Icon(Icons.edit_outlined, color: _blue, size: 19),
          ],
        ),
      ),
    );
  }
}

class ApiSettingsIconButton extends StatelessWidget {
  const ApiSettingsIconButton({
    super.key,
    required this.apiBaseUrl,
    required this.onChanged,
  });

  final String apiBaseUrl;
  final Future<void> Function(String value) onChanged;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Servidor API',
      onPressed: () => showApiSettingsDialog(context, apiBaseUrl, onChanged),
      icon: const Icon(Icons.dns_outlined, color: _blue),
    );
  }
}

Future<void> showApiSettingsDialog(
  BuildContext context,
  String currentValue,
  Future<void> Function(String value) onChanged,
) async {
  final controller = TextEditingController(text: currentValue);
  final focusNode = FocusNode();
  await showDialog<void>(
    context: context,
    builder: (dialogContext) {
      String? errorText;
      return StatefulBuilder(
        builder: (stateContext, setDialogState) {
          return AlertDialog(
            title: const Text('Servidor API'),
            content: TextField(
              controller: controller,
              focusNode: focusNode,
              keyboardType: TextInputType.url,
              decoration: InputDecoration(
                labelText: 'URL',
                hintText: 'http://127.0.0.1:4000/api/v1',
                errorText: errorText,
              ),
              autofocus: true,
            ),
            actions: [
              TextButton(
                onPressed: () {
                  focusNode.unfocus();
                  Navigator.of(dialogContext).pop();
                },
                child: const Text('Cancelar'),
              ),
              FilledButton(
                onPressed: () async {
                  final value = controller.text.trim();
                  final valid =
                      value.startsWith('http://') ||
                      value.startsWith('https://');
                  if (!valid) {
                    setDialogState(() {
                      errorText =
                          'Ingrese una URL valida con http:// o https://';
                    });
                    return;
                  }
                  focusNode.unfocus();
                  await onChanged(value);
                  if (dialogContext.mounted) {
                    Navigator.of(dialogContext).pop();
                  }
                },
                child: const Text('Guardar'),
              ),
            ],
          );
        },
      );
    },
  );
  focusNode.dispose();
  controller.dispose();
}

class BarcodeScannerScreen extends StatefulWidget {
  const BarcodeScannerScreen({super.key});

  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  bool _handlingCode = false;

  void _handleDetection(BarcodeCapture capture) {
    if (_handlingCode) {
      return;
    }
    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue?.trim();
      if (raw == null || raw.isEmpty) {
        continue;
      }
      _handlingCode = true;
      Navigator.of(context).pop(raw);
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Escanear producto'),
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: MobileScannerController(
              detectionSpeed: DetectionSpeed.noDuplicates,
              facing: CameraFacing.back,
              torchEnabled: false,
            ),
            onDetect: _handleDetection,
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              color: Colors.black.withValues(alpha: 0.62),
              child: const Text(
                'Alinee el codigo dentro de la camara para agregar el producto.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white, fontSize: 14),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class CardBox extends StatelessWidget {
  const CardBox({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: _border),
        borderRadius: BorderRadius.circular(6),
      ),
      child: child,
    );
  }
}

class PageHeading extends StatelessWidget {
  const PageHeading({super.key, required this.kicker, required this.title});

  final String kicker;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          kicker,
          style: const TextStyle(
            color: _blue,
            fontSize: 11,
            fontWeight: FontWeight.w900,
          ),
        ),
        Text(
          title,
          style: const TextStyle(
            color: _blue,
            fontSize: 20,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class InfoChip extends StatelessWidget {
  const InfoChip({super.key, required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: const Color(0xffeef6ff),
        border: Border.all(color: _border),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Row(
        children: [
          Icon(icon, size: 15, color: _primary),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: _blue,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
