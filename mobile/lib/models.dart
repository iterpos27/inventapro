class SessionUser {
  const SessionUser({
    required this.id,
    required this.nombre,
    required this.usuario,
    required this.rol,
  });

  final int id;
  final String nombre;
  final String usuario;
  final String rol;

  factory SessionUser.fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: int.tryParse('${json['id']}') ?? 0,
      nombre: '${json['nombre'] ?? ''}',
      usuario: '${json['usuario'] ?? ''}',
      rol: '${json['rol'] ?? ''}',
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'nombre': nombre,
    'usuario': usuario,
    'rol': rol,
  };
}

class CountSession {
  const CountSession({required this.token, required this.user});

  final String token;
  final SessionUser user;
}

class BrandingConfig {
  const BrandingConfig({
    required this.brandName,
    required this.brandAbbreviation,
    required this.brandSubtitle,
    required this.brandLogoUrl,
    required this.brandColorPrimary,
    required this.brandColorSecondary,
  });

  final String brandName;
  final String brandAbbreviation;
  final String brandSubtitle;
  final String brandLogoUrl;
  final String brandColorPrimary;
  final String brandColorSecondary;

  static const fallback = BrandingConfig(
    brandName: 'InventaPro',
    brandAbbreviation: 'IP',
    brandSubtitle: 'Sistema de Conteo e Inventario',
    brandLogoUrl: '',
    brandColorPrimary: '#003f7f',
    brandColorSecondary: '#2364a5',
  );

  factory BrandingConfig.fromJson(Map<String, dynamic> json) {
    return BrandingConfig(
      brandName: '${json['brand_name'] ?? fallback.brandName}',
      brandAbbreviation:
          '${json['brand_abbreviation'] ?? fallback.brandAbbreviation}',
      brandSubtitle: '${json['brand_subtitle'] ?? fallback.brandSubtitle}',
      brandLogoUrl: '${json['brand_logo_url'] ?? ''}',
      brandColorPrimary:
          '${json['brand_color_primary'] ?? fallback.brandColorPrimary}',
      brandColorSecondary:
          '${json['brand_color_secondary'] ?? fallback.brandColorSecondary}',
    );
  }

  Map<String, dynamic> toJson() => {
    'brand_name': brandName,
    'brand_abbreviation': brandAbbreviation,
    'brand_subtitle': brandSubtitle,
    'brand_logo_url': brandLogoUrl,
    'brand_color_primary': brandColorPrimary,
    'brand_color_secondary': brandColorSecondary,
  };
}

class Toma {
  const Toma({
    required this.tomaId,
    required this.numeroToma,
    required this.agencia,
    required this.fechaHabilitacion,
    required this.fechaCierre,
    required this.horaInicio,
    required this.horaFin,
    this.conteoId,
    this.lineas = 0,
  });

  final int tomaId;
  final int? conteoId;
  final String numeroToma;
  final String agencia;
  final String fechaHabilitacion;
  final String fechaCierre;
  final String horaInicio;
  final String horaFin;
  final int lineas;

  factory Toma.fromJson(Map<String, dynamic> json) {
    return Toma(
      tomaId: int.tryParse('${json['toma_id']}') ?? 0,
      conteoId: json['conteo_id'] == null
          ? null
          : int.tryParse('${json['conteo_id']}'),
      numeroToma: '${json['numero_toma'] ?? json['nombre_toma'] ?? ''}',
      agencia: '${json['agencia'] ?? ''}',
      fechaHabilitacion: '${json['fecha_habilitacion'] ?? ''}',
      fechaCierre: '${json['fecha_cierre'] ?? ''}',
      horaInicio: '${json['hora_inicio'] ?? ''}',
      horaFin: '${json['hora_fin'] ?? ''}',
      lineas: int.tryParse('${json['lineas'] ?? 0}') ?? 0,
    );
  }
}

class ConteoInfo {
  const ConteoInfo({
    required this.id,
    required this.version,
    required this.numeroToma,
    required this.agencia,
    required this.fechaHabilitacion,
    required this.fechaCierre,
    required this.horaInicio,
    required this.horaFin,
    required this.estado,
  });

  final int id;
  final int version;
  final String numeroToma;
  final String agencia;
  final String fechaHabilitacion;
  final String fechaCierre;
  final String horaInicio;
  final String horaFin;
  final String estado;

  ConteoInfo copyWith({int? version, String? estado}) {
    return ConteoInfo(
      id: id,
      version: version ?? this.version,
      numeroToma: numeroToma,
      agencia: agencia,
      fechaHabilitacion: fechaHabilitacion,
      fechaCierre: fechaCierre,
      horaInicio: horaInicio,
      horaFin: horaFin,
      estado: estado ?? this.estado,
    );
  }

  factory ConteoInfo.fromJson(Map<String, dynamic> json) {
    return ConteoInfo(
      id: int.tryParse('${json['id'] ?? json['conteo_id']}') ?? 0,
      version:
          int.tryParse('${json['version'] ?? json['conteo_version'] ?? 0}') ??
          0,
      numeroToma: '${json['numero_toma'] ?? json['nombre_toma'] ?? ''}',
      agencia: '${json['agencia'] ?? ''}',
      fechaHabilitacion: '${json['fecha_habilitacion'] ?? ''}',
      fechaCierre: '${json['fecha_cierre'] ?? ''}',
      horaInicio: '${json['hora_inicio'] ?? ''}',
      horaFin: '${json['hora_fin'] ?? ''}',
      estado: '${json['estado'] ?? 'borrador'}',
    );
  }
}

class CountHistory {
  const CountHistory({
    required this.id,
    required this.numeroToma,
    required this.agencia,
    required this.estado,
    required this.lineas,
    required this.unidades,
    required this.fecha,
  });

  final int id;
  final String numeroToma;
  final String agencia;
  final String estado;
  final int lineas;
  final double unidades;
  final String fecha;

  factory CountHistory.fromJson(Map<String, dynamic> json) {
    return CountHistory(
      id: int.tryParse('${json['id']}') ?? 0,
      numeroToma: '${json['numero_toma'] ?? json['nombre_toma'] ?? ''}',
      agencia: '${json['agencia'] ?? ''}',
      estado: '${json['estado'] ?? ''}',
      lineas: int.tryParse('${json['lineas'] ?? 0}') ?? 0,
      unidades: double.tryParse('${json['unidades'] ?? 0}') ?? 0,
      fecha: '${json['fecha_finalizacion'] ?? json['fecha_inicio'] ?? ''}',
    );
  }
}

class Product {
  const Product({
    required this.id,
    required this.codigo,
    required this.descripcion,
  });

  final int id;
  final String codigo;
  final String descripcion;

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: int.tryParse('${json['id'] ?? json['producto_id']}') ?? 0,
      codigo: '${json['codigo'] ?? ''}',
      descripcion: '${json['descripcion'] ?? ''}',
    );
  }
}

class CountItem {
  const CountItem({
    required this.productoId,
    required this.codigo,
    required this.descripcion,
    required this.cantidad,
  });

  final int productoId;
  final String codigo;
  final String descripcion;
  final double cantidad;

  CountItem copyWith({double? cantidad}) {
    return CountItem(
      productoId: productoId,
      codigo: codigo,
      descripcion: descripcion,
      cantidad: cantidad ?? this.cantidad,
    );
  }

  factory CountItem.fromJson(Map<String, dynamic> json) {
    return CountItem(
      productoId: int.tryParse('${json['producto_id'] ?? json['id']}') ?? 0,
      codigo: '${json['codigo'] ?? ''}',
      descripcion: '${json['descripcion'] ?? ''}',
      cantidad: double.tryParse('${json['cantidad'] ?? 0}') ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
    'producto_id': productoId,
    'codigo': codigo,
    'descripcion': descripcion,
    'cantidad': cantidad,
  };
}

class SyncDraftJob {
  const SyncDraftJob({
    required this.conteoId,
    required this.version,
    required this.items,
    required this.status,
    required this.updatedAt,
    this.errorMessage = '',
  });

  final int conteoId;
  final int version;
  final List<CountItem> items;
  final String status;
  final String updatedAt;
  final String errorMessage;

  SyncDraftJob copyWith({
    int? version,
    List<CountItem>? items,
    String? status,
    String? updatedAt,
    String? errorMessage,
  }) {
    return SyncDraftJob(
      conteoId: conteoId,
      version: version ?? this.version,
      items: items ?? this.items,
      status: status ?? this.status,
      updatedAt: updatedAt ?? this.updatedAt,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }

  factory SyncDraftJob.fromJson(Map<String, dynamic> json) {
    final list = json['items'] is List ? json['items'] as List : const [];
    return SyncDraftJob(
      conteoId: int.tryParse('${json['conteo_id'] ?? 0}') ?? 0,
      version: int.tryParse('${json['version'] ?? 0}') ?? 0,
      items: list
          .map((item) => CountItem.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
      status: '${json['status'] ?? 'pending'}',
      updatedAt: '${json['updated_at'] ?? ''}',
      errorMessage: '${json['error_message'] ?? ''}',
    );
  }

  Map<String, dynamic> toJson() => {
    'conteo_id': conteoId,
    'version': version,
    'items': items.map((item) => item.toJson()).toList(),
    'status': status,
    'updated_at': updatedAt,
    'error_message': errorMessage,
  };
}
