import 'package:sqflite/sqflite.dart';

class SeedData {
  static Future<void> insertDemoData(Database db) async {
    final now = DateTime.now();

    // 1. Mother Ama
    await db.insert('users', {
      'id': 'user_ama_01', 'name': 'Ama Mensah', 'phone_number': '+233 24 123 4567',
      'preferred_language': 'en', 'preferred_voice': 'female', 'region_code': 'NORTHERN',
      'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String(),
    });

    await db.insert('maternal_profiles', {
      'id': 'mother_ama_01', 'user_id': 'user_ama_01', 'name': 'Ama Mensah',
      'date_of_birth': DateTime(1996, 5, 14).toIso8601String(), 'location': 'Tamale, Northern Ghana',
      'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String(),
    });

    // 2. Pregnancy
    final lmp26WeeksAgo = now.subtract(const Duration(days: 26 * 7));
    final edd = lmp26WeeksAgo.add(const Duration(days: 280));
    await db.insert('pregnancies', {
      'id': 'preg_ama_01', 'mother_id': 'mother_ama_01',
      'last_menstrual_period': lmp26WeeksAgo.toIso8601String(), 'estimated_due_date': edd.toIso8601String(),
      'pregnancy_status': 'active', 'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String(),
    });

    // 3. Children
    final leoDob = now.subtract(const Duration(days: 365 * 2));
    await db.insert('children', {
      'id': 'child_leo_01', 'caregiver_id': 'user_ama_01', 'name': 'Leo Mensah',
      'date_of_birth': leoDob.toIso8601String(), 'sex': 'M', 'birth_weight': 3.2,
      'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String(),
    });

    final mariamDob = now.subtract(const Duration(days: 180));
    await db.insert('children', {
      'id': 'child_mariam_01', 'caregiver_id': 'user_ama_01', 'name': 'Mariam Mensah',
      'date_of_birth': mariamDob.toIso8601String(), 'sex': 'F', 'birth_weight': 3.0,
      'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String(),
    });

    // 4. Appointments & Demo Tasks
    await db.insert('appointments', {
      'id': 'apt_01', 'profile_id': 'mother_ama_01', 'facility_name': 'City Hospital, Tamale',
      'provider_name': 'Dr. Smith', 'appointment_type': 'ANC Visit', 'appointment_date': now.toIso8601String(),
      'appointment_time': '10:00 AM', 'notes': 'Routine 26-week checkup', 'status': 'scheduled',
      'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String(),
    });

    await db.insert('care_tasks', {
      'id': 'task_01', 'profile_id': 'mother_ama_01', 'profile_type': 'mother',
      'title': 'ANC visit', 'description': 'Dr. Smith · City Hospital', 'category': 'anc',
      'due_date': now.toIso8601String(), 'due_time': '10:00', 'status': 'pending', 'priority': 'important',
      'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String(),
    });

    // 5. Vaccinations & Growth
    await db.insert('vaccinations', {
      'id': 'vax_01', 'child_id': 'child_mariam_01', 'vaccine_name': 'BCG', 'dose_number': 1,
      'scheduled_date': mariamDob.toIso8601String(), 'administered_date': mariamDob.toIso8601String(),
      'status': 'completed', 'facility_name': 'CHPS Compound, Tamale', 'notes': 'Administered at birth',
      'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String(),
    });

    await db.insert('growth_records', {
      'id': 'growth_01', 'child_id': 'child_leo_01', 'record_date': now.toIso8601String(),
      'weight_kg': 14.5, 'height_cm': 95.2, 'notes': 'Growing on track',
      'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String(),
    });

    await db.insert('app_settings', {'key': 'theme_mode', 'value': 'light'});
    await db.insert('app_settings', {'key': 'selected_mother_id', 'value': 'mother_ama_01'});
    await db.insert('app_settings', {'key': 'selected_child_id', 'value': 'child_mariam_01'});

    // --- SPRINT 4C: VERIFIED CLINICAL TEMPLATES (SPNT 4A SPEC) ---
    
    // A. Maternal ANC Contacts (WHO 2016 / GHS 2019 - 8 Contacts)
    final ancWeeks = [12, 20, 26, 30, 34, 36, 38, 40];
    for (var w in ancWeeks) {
      await _insertTemplate(db, now, 
        id: 'tpl_anc_w$w', code: 'ANC_CONTACT', title: 'ANC Visit ($w Weeks)',
        desc: 'Routine ANC contact $w weeks checkup and maternal assessment.',
        cat: 'anc', profileType: 'pregnancy', triggerType: 'PREGNANCY_WEEK', triggerVal: '$w',
        sourceOrg: 'Ghana Health Service / WHO', doc: 'National Safe Motherhood Clinical Guidelines 2019'
      );
    }

    // B. Malaria Prophylaxis (IPTp-SP Ghana Schedule - Weeks 16, 20, 24, 28, 32, 36)
    final iptpWeeks = [16, 20, 24, 28, 32, 36];
    for (var w in iptpWeeks) {
      await _insertTemplate(db, now,
        id: 'tpl_iptp_w$w', code: 'IPTP_SP', title: 'IPTp-SP Malaria Dose ($w Weeks)',
        desc: 'Intermittent preventive treatment for malaria during pregnancy.',
        cat: 'medicine', profileType: 'pregnancy', triggerType: 'PREGNANCY_WEEK', triggerVal: '$w',
        sourceOrg: 'Ghana Health Service', doc: 'GHS Malaria in Pregnancy Protocol 2019'
      );
    }

    // C. Postnatal Care (PNC) Contacts (WHO 2022 / GHS 2019 - 4 Visits for Mother & Newborn)
    final pncDays = [1, 3, 14, 42];
    for (var d in pncDays) {
      await _insertTemplate(db, now,
        id: 'tpl_pnc_mother_d$d', code: 'PNC_MOTHER', title: 'Postnatal Visit (Day $d)',
        desc: 'Maternal postnatal wellness assessment and bleeding check.',
        cat: 'pnc', profileType: 'mother', triggerType: 'POSTNATAL_DAY', triggerVal: '$d',
        sourceOrg: 'Ghana Health Service / WHO', doc: 'WHO Postnatal Care Guidelines 2022'
      );
      await _insertTemplate(db, now,
        id: 'tpl_pnc_child_d$d', code: 'PNC_NEWBORN', title: 'Newborn Checkup (Day $d)',
        desc: 'Newborn weight, jaundice, and cord care assessment.',
        cat: 'pnc', profileType: 'child', triggerType: 'POSTNATAL_DAY', triggerVal: '$d',
        sourceOrg: 'Ghana Health Service / WHO', doc: 'WHO Postnatal Care Guidelines 2022'
      );
    }

    // D. Vitamin A (Months 6, 12, 18, 24, 30, 36, 42, 48, 54, 60)
    final vitAMonths = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60];
    for (var m in vitAMonths) {
      await _insertTemplate(db, now,
        id: 'tpl_vita_m$m', code: 'VITAMIN_A', title: 'Vitamin A Supplement ($m Months)',
        desc: 'Routine bi-annual Vitamin A supplementation.',
        cat: 'nutrition', profileType: 'child', triggerType: 'CHILD_AGE_MONTHS', triggerVal: '$m',
        sourceOrg: 'Ghana Health Service / WHO', doc: 'GHS Child Health Policy'
      );
    }

    // E. GHANA EPI VACCINATIONS
    await _insertVaxTemplate(db, now, 'VAX_BCG', 'BCG', '0', 'CHILD_AGE_DAYS', 'Ghana EPI 2023', null);
    
    await _insertVaxTemplate(db, now, 'VAX_PENTA', 'Pentavalent 1', '6', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);
    await _insertVaxTemplate(db, now, 'VAX_PENTA', 'Pentavalent 2', '10', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);
    await _insertVaxTemplate(db, now, 'VAX_PENTA', 'Pentavalent 3', '14', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);
    
    await _insertVaxTemplate(db, now, 'VAX_OPV', 'OPV 1', '6', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);
    await _insertVaxTemplate(db, now, 'VAX_OPV', 'OPV 2', '10', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);
    await _insertVaxTemplate(db, now, 'VAX_OPV', 'OPV 3', '14', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);
    
    await _insertVaxTemplate(db, now, 'VAX_PCV', 'PCV 1', '6', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);
    await _insertVaxTemplate(db, now, 'VAX_PCV', 'PCV 2', '10', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);
    await _insertVaxTemplate(db, now, 'VAX_PCV', 'PCV 3', '14', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);
    
    await _insertVaxTemplate(db, now, 'VAX_ROTA', 'Rotavirus 1', '6', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);
    await _insertVaxTemplate(db, now, 'VAX_ROTA', 'Rotavirus 2', '10', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);
    
    await _insertVaxTemplate(db, now, 'VAX_IPV', 'IPV', '14', 'CHILD_AGE_WEEKS', 'Ghana EPI 2023', null);

    await _insertVaxTemplate(db, now, 'VAX_MR', 'Measles-Rubella 1', '9', 'CHILD_AGE_MONTHS', 'Ghana EPI 2023', null);
    await _insertVaxTemplate(db, now, 'VAX_MR', 'Measles-Rubella 2', '18', 'CHILD_AGE_MONTHS', 'Ghana EPI 2023', null);
    
    await _insertVaxTemplate(db, now, 'VAX_YF', 'Yellow Fever', '9', 'CHILD_AGE_MONTHS', 'Ghana EPI 2023', null);
    await _insertVaxTemplate(db, now, 'VAX_MENA', 'Meningitis A', '18', 'CHILD_AGE_MONTHS', 'Ghana EPI 2023', null);

    // REGIONAL RULE
    await _insertVaxTemplate(db, now, 'VAX_MALARIA', 'Malaria Dose 1', '6', 'CHILD_AGE_MONTHS', 'Ghana EPI 2023', '["NORTHERN", "UPPER_EAST", "UPPER_WEST", "BONO", "AHAFO"]');

    // DEVELOPMENT ONLY TEMPLATES
    await db.insert('care_templates', {
      'id': 'tpl_test_dev', 'code': 'TEST_DEV', 'title': 'Test Dev Task',
      'description': 'Should not appear in production.', 'category': 'general', 
      'profile_type': 'child', 'trigger_type': 'CHILD_AGE_DAYS', 'trigger_value': '5',
      'priority': 'normal', 'default_duration': 1, 'is_active': 1,
      'metadata': '{"development_only": true}',
      'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String(),
    });
  }

  static Future<void> _insertTemplate(Database db, DateTime now, {
    required String id, required String code, required String title, required String desc,
    required String cat, required String profileType, required String triggerType, required String triggerVal,
    required String sourceOrg, required String doc, String? regionWhitelist
  }) async {
    String meta = '{"source_org": "$sourceOrg", "doc": "$doc", "year": "2019-2023"';
    if (regionWhitelist != null && regionWhitelist.isNotEmpty) {
      meta += ', "region_whitelist": $regionWhitelist';
    }
    meta += '}';

    await db.insert('care_templates', {
      'id': id, 'code': code, 'title': title, 'description': desc,
      'category': cat, 'profile_type': profileType, 'trigger_type': triggerType, 'trigger_value': triggerVal,
      'priority': 'important', 'default_duration': 1, 'is_active': 1,
      'metadata': meta,
      'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String(),
    });
  }

  static Future<void> _insertVaxTemplate(Database db, DateTime now, String code, String title, String triggerVal, String triggerType, String doc, String? regionWhitelist) async {
    await _insertTemplate(db, now,
      id: 'tpl_vax_${code.toLowerCase()}_$triggerType$triggerVal', code: code, title: title,
      desc: 'Routine childhood immunization.', cat: 'vaccine', profileType: 'child',
      triggerType: triggerType, triggerVal: triggerVal, sourceOrg: 'Ghana Health Service - EPI', doc: doc,
      regionWhitelist: regionWhitelist
    );
  }
}