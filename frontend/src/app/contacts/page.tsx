'use client';

import React, { useEffect, useState } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { Plus, Search, X, Trash2, Users, Upload, Check, AlertCircle, Edit, ChevronDown, ChevronRight } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { ContactList, Contact, ContactBatch } from '../../types';
import Link from 'next/link';

export default function ContactsPage() {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [allBatches, setAllBatches] = useState<ContactBatch[]>([]);
  const [totalContactsCount, setTotalContactsCount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  const [showEditListModal, setShowEditListModal] = useState(false);
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editListName, setEditListName] = useState('');
  const [editListDesc, setEditListDesc] = useState('');
  const [editListError, setEditListError] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newSubscribed, setNewSubscribed] = useState(true);
  const [newSelectedListId, setNewSelectedListId] = useState<number | null>(null);
  const [newSelectedBatchId, setNewSelectedBatchId] = useState<number | null>(null);
  const [addError, setAddError] = useState('');

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [targetListId, setTargetListId] = useState<string>('');
  const [batchName, setBatchName] = useState('');
  const [whoIsImporting, setWhoIsImporting] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [importing, setImporting] = useState(false);

  const [showListModal, setShowListModal] = useState(false);
  const [listName, setListName] = useState('');
  const [listDesc, setListDesc] = useState('');
  const [listError, setListError] = useState('');

  useEffect(() => {
    loadData();
    try {
      const savedImporter = localStorage.getItem('who_is_importing');
      if (savedImporter) setWhoIsImporting(savedImporter);
    } catch (e) {}
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [listsRes, batchesRes, contactsCountRes] = await Promise.all([
        apiClient.get('/api/v1/contact-lists/?limit=500'),
        apiClient.get('/api/v1/contact-batches/?limit=500'),
        apiClient.get('/api/v1/contacts/?limit=1'),
      ]);
      setLists(listsRes.results || []);
      setAllBatches(batchesRes.results || []);
      setTotalContactsCount(contactsCountRes.count ?? (contactsCountRes.results?.length || 0));
    } catch (err) {
      console.error('Failed to load contact lists data:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!newEmail || !newEmail.includes('@')) {
      setAddError('Please enter a valid email address.');
      return;
    }
    const targetListId = newSelectedListId || lists.find(l => l.is_default)?.id || lists[0]?.id;
    if (!targetListId) {
      setAddError('Please create or select a list for this contact.');
      return;
    }

    try {
      await apiClient.post('/api/v1/contacts/', {
        email: newEmail,
        first_name: newFirstName,
        last_name: newLastName,
        is_subscribed: newSubscribed,
        lists: [targetListId],
        batches: newSelectedBatchId ? [newSelectedBatchId] : [],
      });
      setShowAddModal(false);
      setNewEmail('');
      setNewFirstName('');
      setNewLastName('');
      setNewSubscribed(true);
      setNewSelectedListId(null);
      setNewSelectedBatchId(null);
      loadData();
    } catch (err: any) {
      setAddError(err.message || 'Failed to add contact.');
    }
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError('');
    setImportSuccess('');
    if (!csvFile) {
      setImportError('Please select a CSV file.');
      return;
    }

    setImporting(true);
    const formData = new FormData();
    formData.append('file', csvFile);
    if (targetListId) {
      formData.append('list_id', targetListId);
    }
    if (batchName) {
      formData.append('batch_name', batchName);
    }
    if (whoIsImporting.trim()) {
      formData.append('who_is_importing', whoIsImporting.trim());
      try {
        localStorage.setItem('who_is_importing', whoIsImporting.trim());
      } catch (e) {}
    }

    try {
      const token = document.cookie.match(new RegExp('(^| )auth_token=([^;]+)'))?.[2];
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Token ${token}`;
      }

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${API_BASE_URL}/api/v1/contacts/import-csv/`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'CSV import failed.');
      }

      setImportSuccess(resData.message);
      setCsvFile(null);
      setBatchName('');
      setTimeout(() => {
        setShowImportModal(false);
        setImportSuccess('');
        loadData();
      }, 3000);
    } catch (err: any) {
      setImportError(err.message || 'An error occurred during import.');
    } finally {
      setImporting(false);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    setListError('');
    if (!listName.trim()) {
      setListError('Please enter a list name.');
      return;
    }

    try {
      await apiClient.post('/api/v1/contact-lists/', {
        name: listName,
        description: listDesc,
      });
      setShowListModal(false);
      setListName('');
      setListDesc('');
      loadData();
    } catch (err: any) {
      setListError(err.message || 'Failed to create list.');
    }
  };

  const handleDeleteList = async (id: number) => {
    if (!confirm('Are you sure you want to delete this list? The contacts inside it will not be deleted.')) return;
    try {
      await apiClient.delete(`/api/v1/contact-lists/${id}/`);
      loadData();
    } catch (err: any) {
      console.error('Failed to delete list:', err);
      alert('Failed to delete list.');
    }
  };

  const openEditListModal = (list: ContactList) => {
    setEditingListId(list.id);
    setEditListName(list.name);
    setEditListDesc(list.description || '');
    setEditListError('');
    setShowEditListModal(true);
  };

  const handleEditList = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditListError('');
    if (!editListName.trim()) {
      setEditListError('Please enter a list name.');
      return;
    }

    try {
      await apiClient.patch(`/api/v1/contact-lists/${editingListId}/`, {
        name: editListName,
        description: editListDesc,
      });
      setShowEditListModal(false);
      setEditingListId(null);
      loadData();
    } catch (err: any) {
      setEditListError(err.message || 'Failed to update list.');
    }
  };

  const filteredLists = lists.filter(l => {
    if (!searchQuery.trim()) return true;
    const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const name = l.name.toLowerCase();
    const desc = (l.description || '').toLowerCase();
    return tokens.every(token => name.includes(token) || desc.includes(token));
  });

  // Date grouping removed per user request

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users size={28} />
            Contact Lists
          </h1>
          <p className="text-foreground/50 mt-1 text-sm">Manage and organize your contact lists.</p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 w-full sm:w-auto mt-4 sm:mt-0">
          <Link href="/contacts/mutuals" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto flex items-center justify-center gap-2 text-amber-500 hover:bg-amber-50 hover:border-amber-200">
              <Users size={16} />
              <span>Mutual Contacts</span>
            </Button>
          </Link>
          <Link href="/contacts/ignored" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto flex items-center justify-center gap-2 text-red-500 hover:bg-red-50 hover:border-red-200">
              <AlertCircle size={16} />
              <span>Ignored Contacts</span>
            </Button>
          </Link>
          <Button onClick={() => setShowImportModal(true)} variant="outline" className="w-full sm:w-auto flex items-center justify-center gap-2">
            <Upload size={16} />
            <span>Import CSV</span>
          </Button>
          <Button onClick={() => {
            const defaultListId = lists.find(l => l.is_default)?.id || lists[0]?.id || null;
            setNewSelectedListId(defaultListId);
            setShowAddModal(true);
          }} variant="outline" className="w-full sm:w-auto flex items-center justify-center gap-2">
            <Users size={16} />
            <span>Add Contact</span>
          </Button>
          <Button onClick={() => setShowListModal(true)} className="w-full sm:w-auto flex items-center justify-center gap-2">
            <Plus size={16} />
            <span>Create List</span>
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex items-center space-x-3 bg-background border border-border rounded-md px-3 py-2 w-full max-w-md">
          <Search size={16} className="text-foreground/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contact lists..."
            className="w-full text-sm bg-transparent border-0 focus:outline-none focus:ring-0"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}>
              <X size={16} className="text-foreground/40 hover:text-foreground" />
            </button>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="text-sm text-foreground/40 py-12 text-center">Loading contact lists...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="p-0 relative group flex flex-col justify-between">
              <Link href={`/directory`} className="flex flex-col h-full hover:bg-foreground/[0.02] transition-colors p-4">
                <div>
                  <h3 className="font-semibold text-lg pr-6 text-foreground">All Contacts</h3>
                  <p className="text-xs text-foreground/50 mt-1 line-clamp-2">Master list containing all contacts across the platform</p>
                </div>
                <div className="mt-6 flex items-end justify-between border-t border-border pt-3">
                  <div className="text-2xl font-bold text-foreground">
                    {totalContactsCount} <span className="text-xs font-normal text-foreground/50 uppercase tracking-widest ml-1">Contacts</span>
                  </div>
                </div>
              </Link>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLists.filter(list => !list.is_default).map(list => (
              <Card key={list.id} className="p-0 relative group flex flex-col justify-between overflow-hidden">
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditListModal(list); }}
                    className="text-foreground/50 hover:text-blue-500 p-2 rounded-md hover:bg-blue-500/10 transition-colors"
                    title="Edit List"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteList(list.id); }}
                    className="text-foreground/50 hover:text-red-500 p-2 rounded-md hover:bg-red-500/10 transition-colors"
                    title="Delete List"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <Link href={`/contacts/${list.id}`} className="p-4 flex flex-col h-full hover:bg-foreground/[0.02] transition-colors">
                  <div>
                    <h3 className="font-semibold text-lg pr-16 text-foreground">{list.name}</h3>
                    <p className="text-xs text-foreground/50 mt-1 line-clamp-2">{list.description || 'No description provided'}</p>
                  </div>
                  <div className="mt-6 flex items-end justify-between border-t border-border pt-3">
                    <div className="text-2xl font-bold text-foreground">
                      {list.contacts_count ?? 0} <span className="text-xs font-normal text-foreground/50 uppercase tracking-widest ml-1">Contacts</span>
                    </div>
                  </div>
                </Link>
              </Card>
            ))}
          </div>
          
          {filteredLists.filter(list => !list.is_default).length === 0 && searchQuery && (
            <div className="py-8 text-center text-foreground/50 text-sm">
              No lists match your search query.
            </div>
          )}
        </div>
      )}

      {showEditListModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 border border-border bg-background shadow-lg relative">
            <button className="absolute top-4 right-4 text-foreground/50 hover:text-foreground" onClick={() => setShowEditListModal(false)}>
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-4">Edit Contact List</h2>
            <form onSubmit={handleEditList} className="space-y-4">
              {editListError && <div className="text-xs text-red-500">{editListError}</div>}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">List Name</label>
                <input
                  type="text"
                  value={editListName}
                  onChange={e => setEditListName(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. Speaker Invites"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Description</label>
                <textarea
                  value={editListDesc}
                  onChange={e => setEditListDesc(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="Short explanation of this list..."
                  rows={3}
                />
              </div>
              <Button type="submit" className="w-full py-2">Save Changes</Button>
            </form>
          </Card>
        </div>
      )}

      {showListModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 border border-border bg-background shadow-lg relative">
            <button className="absolute top-4 right-4 text-foreground/50 hover:text-foreground" onClick={() => setShowListModal(false)}>
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-4">Create Contact List</h2>
            <form onSubmit={handleCreateList} className="space-y-4">
              {listError && <div className="text-xs text-red-500">{listError}</div>}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">List Name</label>
                <input
                  type="text"
                  value={listName}
                  onChange={e => setListName(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. Speaker Invites"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Description</label>
                <textarea
                  value={listDesc}
                  onChange={e => setListDesc(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="Short explanation of this list..."
                  rows={3}
                />
              </div>
              <Button type="submit" className="w-full py-2">Create List</Button>
            </form>
          </Card>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 border border-border bg-background shadow-lg relative">
            <button className="absolute top-4 right-4 text-foreground/50 hover:text-foreground" onClick={() => {
              setShowAddModal(false);
              setNewEmail(''); setNewFirstName(''); setNewLastName('');
              setNewSelectedListId(null); setNewSelectedBatchId(null); setAddError('');
            }}>
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-4">Add Contact Manually</h2>
            <form onSubmit={handleAddContact} className="space-y-4">
              {addError && <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 px-3 py-2 rounded-md">{addError}</div>}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Email Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="name@example.com"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">First Name</label>
                  <input
                    type="text"
                    value={newFirstName}
                    onChange={e => setNewFirstName(e.target.value)}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                    placeholder="John"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Last Name</label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={e => setNewLastName(e.target.value)}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Select List <span className="text-red-500">*</span></label>
                <select
                  value={newSelectedListId ?? ''}
                  onChange={e => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setNewSelectedListId(val);
                    setNewSelectedBatchId(null); // reset batch when list changes
                  }}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  required
                >
                  <option value="">-- Select a list --</option>
                  {lists.map(list => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              </div>

              {newSelectedListId && allBatches.filter(b => b.contact_list === newSelectedListId).length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Select Batch (Optional)</label>
                  <select
                    value={newSelectedBatchId ?? ''}
                    onChange={e => setNewSelectedBatchId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  >
                    <option value="">-- Select a batch (optional) --</option>
                    {allBatches.filter(b => b.contact_list === newSelectedListId).map(batch => (
                      <option key={batch.id} value={batch.id}>{batch.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="subscribed"
                  checked={newSubscribed}
                  onChange={e => setNewSubscribed(e.target.checked)}
                  className="rounded border-border text-foreground"
                />
                <label htmlFor="subscribed" className="text-sm font-medium">Subscribed to mailings</label>
              </div>

              <Button type="submit" className="w-full py-2 mt-4">Add Contact</Button>
            </form>
          </Card>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 border border-border bg-background shadow-lg relative">
            <button className="absolute top-4 right-4 text-foreground/50 hover:text-foreground" onClick={() => setShowImportModal(false)}>
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-2">Import Contacts from CSV</h2>
            <p className="text-xs text-foreground/50 mb-4">Upload a CSV file. Expected columns: <code className="bg-foreground/5 px-1 py-0.5 rounded">email</code>, <code className="bg-foreground/5 px-1 py-0.5 rounded">first_name</code>, <code className="bg-foreground/5 px-1 py-0.5 rounded">last_name</code>, <code className="bg-foreground/5 px-1 py-0.5 rounded">is_subscribed</code>.</p>
            
            <form onSubmit={handleImportCsv} className="space-y-4">
              {importError && (
                <div className="p-3 bg-red-950/20 text-red-500 text-xs rounded-md font-medium border border-red-900/30 flex items-start space-x-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}
              {importSuccess && (
                <div className="p-3 bg-green-950/20 text-green-500 text-xs rounded-md font-medium border border-green-900/30 flex items-start space-x-2">
                  <Check size={16} className="shrink-0 mt-0.5" />
                  <span>{importSuccess}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Target List (Optional)</label>
                <select
                  value={targetListId}
                  onChange={e => setTargetListId(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                >
                  <option value="">-- None (Don't add to any list) --</option>
                  {lists.filter(l => !l.is_default).map(list => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              </div>

              {targetListId && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Batch Name (Optional)</label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={e => setBatchName(e.target.value)}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                    placeholder="e.g. Batch 1"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50">Who is Importing (Optional)</label>
                <input
                  type="text"
                  value={whoIsImporting}
                  onChange={e => setWhoIsImporting(e.target.value)}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. Your name or team"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/50 font-medium">Select File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => setCsvFile(e.target.files?.[0] || null)}
                  className="w-full text-sm border border-border rounded-md p-2 bg-background"
                  required
                />
              </div>

              <Button type="submit" className="w-full py-2.5 mt-4" disabled={importing || !!importSuccess}>
                {importing ? 'Importing contacts...' : 'Import CSV File'}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
