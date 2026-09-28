# Generated manually for MutualContact with IF NOT EXISTS safe database operations

from django.db import migrations, models


def create_mutualcontact_table(apps, schema_editor):
    if schema_editor.connection.vendor == 'sqlite':
        schema_editor.execute("""
            CREATE TABLE IF NOT EXISTS contacts_mutualcontact (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email VARCHAR(255) NOT NULL,
                first_name VARCHAR(255) NOT NULL DEFAULT '',
                last_name VARCHAR(255) NOT NULL DEFAULT '',
                who_is_importing VARCHAR(255) NOT NULL DEFAULT '',
                target_list_name VARCHAR(255) NOT NULL DEFAULT '',
                already_exists_in VARCHAR(255) NOT NULL DEFAULT '',
                reason TEXT NOT NULL DEFAULT 'Mutual: already exists in another list',
                imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        """)
        schema_editor.execute("CREATE INDEX IF NOT EXISTS contacts_mutualcontact_email_idx ON contacts_mutualcontact (email);")
        schema_editor.execute("CREATE INDEX IF NOT EXISTS contacts_mutualcontact_imported_at_idx ON contacts_mutualcontact (imported_at);")
    else:
        schema_editor.execute("""
            CREATE TABLE IF NOT EXISTS contacts_mutualcontact (
                id BIGSERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                first_name VARCHAR(255) NOT NULL DEFAULT '',
                last_name VARCHAR(255) NOT NULL DEFAULT '',
                who_is_importing VARCHAR(255) NOT NULL DEFAULT '',
                target_list_name VARCHAR(255) NOT NULL DEFAULT '',
                already_exists_in VARCHAR(255) NOT NULL DEFAULT '',
                reason TEXT NOT NULL DEFAULT 'Mutual: already exists in another list',
                imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS contacts_mutualcontact_email_idx ON contacts_mutualcontact (email);
            CREATE INDEX IF NOT EXISTS contacts_mutualcontact_imported_at_idx ON contacts_mutualcontact (imported_at DESC);
        """)


def drop_mutualcontact_table(apps, schema_editor):
    schema_editor.execute("DROP TABLE IF EXISTS contacts_mutualcontact;")


class Migration(migrations.Migration):

    dependencies = [
        ('contacts', '0006_rename_contacts_co_first_n_08bb97_idx_contacts_co_first_n_57a3e4_idx_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='MutualContact',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('email', models.EmailField(max_length=255)),
                        ('first_name', models.CharField(blank=True, max_length=255)),
                        ('last_name', models.CharField(blank=True, max_length=255)),
                        ('who_is_importing', models.CharField(blank=True, max_length=255)),
                        ('target_list_name', models.CharField(blank=True, max_length=255)),
                        ('already_exists_in', models.CharField(max_length=255)),
                        ('reason', models.TextField(default='Mutual: already exists in another list')),
                        ('imported_at', models.DateTimeField(auto_now_add=True)),
                    ],
                    options={
                        'ordering': ['-imported_at'],
                    },
                ),
            ],
            database_operations=[
                migrations.RunPython(create_mutualcontact_table, drop_mutualcontact_table),
            ],
        ),
    ]
