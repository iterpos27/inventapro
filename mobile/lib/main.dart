import 'dart:async';

import 'package:flutter/material.dart';

import 'api_client.dart';
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
  final api = ApiClient();
  final store = LocalStore();
  CountSession? session;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final saved = await store.readSession();
    api.token = saved?.token;
    setState(() {
      session = saved;
      loading = false;
    });
  }

  Future<void> _setSession(CountSession next) async {
    await store.saveSession(next);
    api.token = next.token;
    setState(() => session = next);
  }

  Future<void> _logout() async {
    await api.logout();
    await store.clearSession();
    setState(() => session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (session == null) {
      return LoginScreen(api: api, onLogin: _setSession);
    }
    return OperationHome(
      api: api,
      store: store,
      user: session!.user,
      onLogout: _logout,
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onLogin});

  final ApiClient api;
  final Future<void> Function(CountSession session) onLogin;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final userCtrl = TextEditingController();
  final passCtrl = TextEditingController();
  bool loading = false;

  Future<void> _login() async {
    setState(() => loading = true);
    try {
      final session = await widget.api.login(userCtrl.text.trim(), passCtrl.text);
      await widget.onLogin(session);
    } catch (err) {
      _toast('$err', warning: false);
    } finally {
      if (mounted) setState(() => loading = false);
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
                        child: const Center(
                          child: Text(
                            'IP',
                            style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 22),
                    const Text(
                      'INVENTAPRO',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: _blue, fontSize: 24, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 4),
                    const Text('Sistema de Conteo', textAlign: TextAlign.center, style: TextStyle(color: Colors.black54)),
                    const SizedBox(height: 28),
                    TextField(controller: userCtrl, decoration: const InputDecoration(labelText: 'Usuario')),
                    const SizedBox(height: 16),
                    TextField(
                      controller: passCtrl,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Contrasena'),
                      onSubmitted: (_) => _login(),
                    ),
                    const SizedBox(height: 22),
                    FilledButton(
                      onPressed: loading ? null : _login,
                      style: FilledButton.styleFrom(backgroundColor: _primary, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6))),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        child: Text(loading ? 'Ingresando...' : 'Ingresar'),
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
    required this.onLogout,
  });

  final ApiClient api;
  final LocalStore store;
  final SessionUser user;
  final Future<void> Function() onLogout;

  @override
  State<OperationHome> createState() => _OperationHomeState();
}

class _OperationHomeState extends State<OperationHome> {
  List<Toma> tomas = [];
  ConteoInfo? conteo;
  List<CountItem> items = [];
  List<Product> results = [];
  final searchCtrl = TextEditingController();
  final searchFocus = FocusNode();
  Timer? searchTimer;
  Timer? autoSaveTimer;
  bool loading = true;
  bool saving = false;
  String saveStatus = 'Sin cambios recientes.';

  @override
  void initState() {
    super.initState();
    _loadTomas();
  }

  @override
  void dispose() {
    searchTimer?.cancel();
    autoSaveTimer?.cancel();
    searchCtrl.dispose();
    searchFocus.dispose();
    super.dispose();
  }

  Future<void> _loadTomas() async {
    setState(() => loading = true);
    try {
      final data = await widget.api.tomas();
      setState(() => tomas = data);
    } catch (err) {
      _toast('$err', isError: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _openToma(Toma toma) async {
    setState(() => loading = true);
    try {
      final conteoId = toma.conteoId ?? await widget.api.iniciarConteo(toma.tomaId);
      final detail = await widget.api.detalleConteo(conteoId, toma);
      final localDraft = await widget.store.readDraft(conteoId);
      setState(() {
        conteo = detail.conteo.copyWith(version: localDraft?.version);
        items = localDraft?.items ?? detail.items;
        results = [];
        searchCtrl.clear();
        saveStatus = localDraft == null ? 'Sin cambios recientes.' : 'Borrador local pendiente de sincronizar.';
      });
      _scheduleAutoSave();
    } catch (err) {
      _toast('$err', isError: true);
    } finally {
      if (mounted) setState(() => loading = false);
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
        if (mounted) setState(() => results = cached);
        return;
      }
      try {
        final data = await widget.api.searchProducts(term);
        await widget.store.saveSearch(term, data);
        if (mounted) setState(() => results = data);
      } catch (err) {
        _toast('$err', isError: true);
      }
    });
  }

  void _addProduct(Product product) {
    final exists = items.any((item) => item.productoId == product.id);
    if (exists) {
      _toast('Producto ya ingresado en este conteo.', isWarning: true);
      return;
    }
    setState(() {
      items = [
        CountItem(productoId: product.id, codigo: product.codigo, descripcion: product.descripcion, cantidad: 1),
        ...items,
      ];
      results = [];
      searchCtrl.clear();
      saveStatus = 'Cambios pendientes...';
    });
    _persistLocalDraft();
    _scheduleAutoSave();
  }

  void _updateQty(int productoId, String value) {
    final qty = double.tryParse(value.replaceAll(',', '.')) ?? 0;
    setState(() {
      items = items.map((item) => item.productoId == productoId ? item.copyWith(cantidad: qty) : item).toList();
      saveStatus = 'Cambios pendientes...';
    });
    _persistLocalDraft();
    _scheduleAutoSave();
  }

  void _removeItem(int productoId) {
    setState(() {
      items = items.where((item) => item.productoId != productoId).toList();
      saveStatus = 'Cambios pendientes...';
    });
    _persistLocalDraft();
    _scheduleAutoSave();
  }

  List<CountItem> get validItems => items.where((item) => item.cantidad > 0).toList();

  Future<void> _persistLocalDraft() async {
    final current = conteo;
    if (current == null) return;
    await widget.store.saveDraft(current.id, current.version, items);
  }

  void _scheduleAutoSave() {
    autoSaveTimer?.cancel();
    if (conteo == null || validItems.isEmpty) return;
    autoSaveTimer = Timer(const Duration(minutes: 3), () => _saveDraft(silent: true));
  }

  Future<void> _saveDraft({bool silent = false}) async {
    final current = conteo;
    if (current == null || validItems.isEmpty || saving) return;
    setState(() {
      saving = true;
      saveStatus = 'Guardando borrador...';
    });
    try {
      final version = await widget.api.guardarBorrador(current.id, current.version, validItems);
      await widget.store.clearDraft(current.id);
      setState(() {
        conteo = current.copyWith(version: version);
        saveStatus = 'Borrador guardado.';
      });
      if (!silent) _toast('Borrador guardado.');
    } catch (err) {
      await _persistLocalDraft();
      setState(() => saveStatus = 'Borrador local guardado. Pendiente de sincronizar.');
      if (!silent) _toast('$err', isWarning: true);
    } finally {
      if (mounted) setState(() => saving = false);
      _scheduleAutoSave();
    }
  }

  Future<void> _finish() async {
    final current = conteo;
    if (current == null || validItems.isEmpty || saving) return;
    setState(() {
      saving = true;
      saveStatus = 'Finalizando conteo...';
    });
    try {
      await widget.api.finalizarConteo(current.id, current.version, validItems);
      await widget.store.clearDraft(current.id);
      setState(() {
        conteo = null;
        items = [];
        saveStatus = 'Sin cambios recientes.';
      });
      await _loadTomas();
      _toast('Conteo finalizado.');
    } catch (err) {
      await _persistLocalDraft();
      _toast('$err', isError: true);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  void _toast(String message, {bool isError = false, bool isWarning = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: isError ? _red : (isWarning ? const Color(0xffd99a00) : _green),
        content: Text(message),
      ),
    );
  }

  String _title(String raw) {
    final value = raw.trim();
    if (value.toUpperCase().startsWith('TOMA FISICA #')) return value.toUpperCase();
    return 'TOMA FISICA # $value'.toUpperCase();
  }

  String _period(String date, String hour) {
    final cleanDate = date.length >= 10 ? date.substring(0, 10) : date;
    final cleanHour = hour.length >= 5 ? hour.substring(0, 5) : hour;
    return [cleanDate, cleanHour].where((part) => part.isNotEmpty).join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final current = conteo;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.user.nombre, style: const TextStyle(color: _blue, fontSize: 13, fontWeight: FontWeight.w800)),
            Text(current == null ? 'Conteo' : 'Conteo y Borradores', style: const TextStyle(color: _blue, fontSize: 18, fontWeight: FontWeight.w900)),
          ],
        ),
        actions: [
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
    );
  }

  Widget _buildTomaList() {
    return RefreshIndicator(
      onRefresh: _loadTomas,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const PageHeading(kicker: 'CONTEO FISICO', title: 'Seleccionar conteo'),
          const SizedBox(height: 12),
          CardBox(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Conteos disponibles', style: TextStyle(color: _blue, fontSize: 17, fontWeight: FontWeight.w900)),
                const SizedBox(height: 12),
                if (tomas.isEmpty) const Text('No hay tomas abiertas asignadas.'),
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
                                  Text(_title(toma.numeroToma), style: const TextStyle(color: _blue, fontSize: 17, fontWeight: FontWeight.w900)),
                                  const SizedBox(height: 6),
                                  Text('AGENCIA: ${toma.agencia}', style: const TextStyle(color: _blue, fontWeight: FontWeight.w800)),
                                  Text('HABILITACION: ${_period(toma.fechaHabilitacion, toma.horaInicio)}', style: const TextStyle(color: _blue, fontWeight: FontWeight.w800)),
                                  Text('FINALIZACION: ${_period(toma.fechaCierre, toma.horaFin)}', style: const TextStyle(color: _blue, fontWeight: FontWeight.w800)),
                                  const SizedBox(height: 8),
                                  Text('${toma.lineas} lineas registradas - ${toma.conteoId == null ? 'Empezar' : 'Continuar'}'),
                                ],
                              ),
                            ),
                            const Icon(Icons.arrow_circle_right_outlined, color: _blue, size: 28),
                          ],
                        ),
                      ),
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
                  Text('OPERACION ACTIVA', style: TextStyle(color: _blue, fontWeight: FontWeight.w900)),
                ],
              ),
              const SizedBox(height: 10),
              Text(_title(current.numeroToma), style: const TextStyle(color: _blue, fontSize: 22, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text(saveStatus, style: const TextStyle(color: Colors.black87, fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              InfoChip(icon: Icons.apartment_outlined, label: 'Agencia: ${current.agencia}'),
              InfoChip(icon: Icons.calendar_month_outlined, label: 'Habilitacion: ${_period(current.fechaHabilitacion, current.horaInicio)}'),
              InfoChip(icon: Icons.event_available_outlined, label: 'Cierre: ${_period(current.fechaCierre, current.horaFin)}'),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: saving || validItems.isEmpty ? null : () => _saveDraft(),
                icon: const Icon(Icons.save_outlined),
                label: const Text('Guardar borrador'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _blue,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                  side: const BorderSide(color: _primary),
                ),
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: saving || validItems.isEmpty ? null : _finish,
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Finalizar conteo'),
                style: FilledButton.styleFrom(
                  backgroundColor: _green,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
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
              TextField(
                controller: searchCtrl,
                focusNode: searchFocus,
                decoration: const InputDecoration(hintText: 'Codigo o descripcion', prefixIcon: Icon(Icons.search)),
                onChanged: _search,
              ),
              if (results.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _border), borderRadius: BorderRadius.circular(6)),
                  child: Column(
                    children: results
                        .map(
                          (product) => ListTile(
                            dense: true,
                            title: Text(product.codigo, style: const TextStyle(color: _blue, fontWeight: FontWeight.w900)),
                            subtitle: Text(product.descripcion, maxLines: 2, overflow: TextOverflow.ellipsis),
                            trailing: const Icon(Icons.add_circle_outline, color: _primary),
                            onTap: () => _addProduct(product),
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
                  const Expanded(child: Text('Productos contados', style: TextStyle(color: _blue, fontSize: 17, fontWeight: FontWeight.w900))),
                  Chip(label: Text('${items.length}'), backgroundColor: const Color(0xffdcecff), side: BorderSide.none),
                ],
              ),
              const SizedBox(height: 8),
              if (items.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 28),
                  child: Center(child: Text('Agregue productos para iniciar el conteo.')),
                ),
              ...items.map(
                (item) => Container(
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
                            Text(item.codigo, style: const TextStyle(color: _blue, fontWeight: FontWeight.w900)),
                            Text(item.descripcion, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 78,
                        child: TextFormField(
                          initialValue: item.cantidad.toStringAsFixed(item.cantidad.truncateToDouble() == item.cantidad ? 0 : 2),
                          textAlign: TextAlign.center,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 10)),
                          onChanged: (value) => _updateQty(item.productoId, value),
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
        Text(kicker, style: const TextStyle(color: _blue, fontSize: 12, fontWeight: FontWeight.w900)),
        Text(title, style: const TextStyle(color: _blue, fontSize: 25, fontWeight: FontWeight.w900)),
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
          Expanded(child: Text(label, style: const TextStyle(color: _blue, fontWeight: FontWeight.w800))),
        ],
      ),
    );
  }
}
