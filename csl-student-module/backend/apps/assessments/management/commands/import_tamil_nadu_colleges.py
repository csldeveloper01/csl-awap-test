import json
import os
from pathlib import Path
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.assessments.models import College, normalize_college_name


class Command(BaseCommand):
    help = "Ingest authentic, verified Tamil Nadu higher educational institutions into College directory"

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            type=str,
            default=None,
            help="Path to JSON dataset file. Defaults to data/tamil_nadu_institutions.json",
        )

    def handle(self, *args, **options):
        file_path = options.get("file")
        if not file_path:
            from django.conf import settings
            file_path = settings.BASE_DIR / "data" / "tamil_nadu_institutions.json"
        else:
            file_path = Path(file_path)

        if not file_path.exists():
            self.stderr.write(self.style.ERROR(f"Dataset file not found: {file_path}"))
            return

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        created_count = 0
        updated_count = 0
        skipped_count = 0

        with transaction.atomic():
            for item in data:
                name = item.get("name", "").strip()
                code = item.get("code", "").strip().upper()
                if not name or not code:
                    skipped_count += 1
                    continue

                norm = normalize_college_name(name)
                aliases = item.get("aliases", [])

                college = College.objects.filter(code=code).first()
                if not college:
                    college = College.objects.filter(normalized_name=norm).first()

                if college:
                    # Update details
                    college.name = name
                    college.normalized_name = norm
                    college.district = item.get("district", college.district)
                    college.city = item.get("city", college.city)
                    college.institution_type = item.get("institution_type", college.institution_type)
                    college.affiliation = item.get("affiliation", college.affiliation)
                    college.website = item.get("website", college.website)
                    college.location = item.get("location", college.location)
                    college.address = item.get("address", college.address)
                    college.is_verified = True
                    college.is_active = True
                    # Merge aliases
                    existing_aliases = set(college.aliases or [])
                    existing_aliases.update(aliases)
                    college.aliases = list(existing_aliases)
                    college.save()
                    updated_count += 1
                else:
                    College.objects.create(
                        name=name,
                        code=code,
                        normalized_name=norm,
                        district=item.get("district", ""),
                        city=item.get("city", ""),
                        institution_type=item.get("institution_type", "Engineering College"),
                        affiliation=item.get("affiliation", "Anna University"),
                        website=item.get("website", ""),
                        location=item.get("location", ""),
                        address=item.get("address", ""),
                        aliases=aliases,
                        is_verified=True,
                        is_active=True,
                    )
                    created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Tamil Nadu colleges ingested successfully: {created_count} created, {updated_count} updated, {skipped_count} skipped. Total verified institutions: {College.objects.filter(is_verified=True).count()}."
            )
        )
