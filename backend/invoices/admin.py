from django.contrib import admin
from .models import Invoice


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'filename',
        'status',
        'lexware_status',
        'paperless_status',
        'created_at',
    ]
    list_filter = ['status', 'lexware_status', 'paperless_status', 'created_at']
    search_fields = ['filename']
    readonly_fields = [
        'filename',
        'file_size',
        'created_at',
        'updated_at',
        'lexware_transferred_at',
        'paperless_transferred_at',
    ]
