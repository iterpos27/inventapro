import 'package:flutter/material.dart';

import '../app_theme.dart';
import '../models.dart';

class BrandMark extends StatelessWidget {
  const BrandMark({
    super.key,
    required this.branding,
    this.size = 76,
    this.borderRadius = 8,
  });

  final BrandingConfig branding;
  final double size;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: appPrimary,
        borderRadius: BorderRadius.circular(borderRadius),
      ),
      child: branding.brandLogoUrl.trim().isNotEmpty
          ? ClipRRect(
              borderRadius: BorderRadius.circular(borderRadius),
              child: Image.network(
                branding.brandLogoUrl.trim(),
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) =>
                    _BrandFallback(abbreviation: branding.brandAbbreviation),
              ),
            )
          : _BrandFallback(abbreviation: branding.brandAbbreviation),
    );
  }
}

class _BrandFallback extends StatelessWidget {
  const _BrandFallback({required this.abbreviation});

  final String abbreviation;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        abbreviation,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 20,
          fontWeight: FontWeight.w800,
        ),
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
        border: Border.all(color: appBorder),
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
            color: appBlue,
            fontSize: 11,
            fontWeight: FontWeight.w900,
          ),
        ),
        Text(
          title,
          style: const TextStyle(
            color: appBlue,
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
        border: Border.all(color: appBorder),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Row(
        children: [
          Icon(icon, size: 15, color: appPrimary),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: appBlue,
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
