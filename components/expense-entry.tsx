"use client";

import { expenseFormStyles as styles, expenseStyles } from "@/app/theme";
import { useEffect, useMemo, useRef, useState } from "react";
import { compressReceipt } from '@/lib/receipt-image';
import { PaidBy } from './paid-by';
import Alert from '@mui/material/Alert';
import { paymentContext, type PaymentContext } from '@/lib/payment-outbox';
import { lagosBusinessDate, nairaToKobo } from '@/lib/accounting-entry';
import { expenseContract, type ExpenseItem } from '@/lib/expense-contract';
import { expenseChanges, type ApprovalRuleRow, type EntryChange } from '@/lib/approvals-view';
import { ApprovalReasonSheet } from '@/components/approval-reason-sheet';
import { saveExpenseRequest } from '@/lib/expense-outbox';
import { normalizePaymentMethod } from '@/lib/payment-methods';
import { parseAmount } from "@/lib/financial-utils";
import { toast } from "sonner";
import { useSyncStore } from "@/lib/store";
import { Camera, Check, Loader2, Receipt } from "lucide-react";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import { SegmentedControl } from "@/components/segmented-control";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";

type RecentExpense = {
  id: string;
  amount: string;
  category: string;
  description: string;
  date: string;
  paymentMethod: string;
  paidTo: string;
};

import { EXPENSE_CATEGORIES, PAYMENT_METHODS, STORAGE_KEYS, SYSTEM_DEFAULTS } from "@/lib/constants";

/** `prefill` starts the form from expenses saved earlier on this phone: one row fills the form, several fill the batch. */
export function ExpenseEntry({ onSaved, embedded = false, prefill }: { onSaved?: () => void; embedded?: boolean; prefill?: Record<string, string>[] } = {}) {
  const [context,setContext]=useState<PaymentContext|null>(null);
  const [categories,setCategories]=useState<string[]>([]);
  const [loadError,setLoadError]=useState('');
  const [receiptSize,setReceiptSize]=useState('');
  const [receiptError,setReceiptError]=useState('');
  // The owner's approval rules, so a cashier is asked for a reason before sending an expense above the limit.
  const [approvalRules,setApprovalRules]=useState<{rules:ApprovalRuleRow[];isOwner:boolean}|null>(null);
  const [askReason,setAskReason]=useState<EntryChange[]|null>(null);
  const saving=useRef(false);
  const uploadRequest=useRef<{file:File;id:string}|null>(null);
  const postgres=context?.backend==='postgres';
  useEffect(()=>{
    let active=true;
    void paymentContext().then(async value=>{
      if(!active)return;setContext(value);
      if(value.backend==='postgres') {
        try {
          const rulesResponse=await fetch('/api/accounting/approval-rules?for=entry',{cache:'no-store'}),rules=await rulesResponse.json();
          if(rulesResponse.ok&&Array.isArray(rules.rules)){if(active)setApprovalRules(rules);localStorage.setItem('bomedia-approval-rules',JSON.stringify(rules));}
          else throw new Error();
        }catch{
          try {const saved=JSON.parse(localStorage.getItem('bomedia-approval-rules')||'null');if(active&&saved)setApprovalRules(saved);}catch{/* The server still decides. */}
        }
        const cacheKey=`bomedia-expense-categories:${value.staffId}`;
        try {const r=await fetch('/api/accounting/records?resource=expense_categories',{cache:'no-store'}),body=await r.json();
          if(!r.ok||!Array.isArray(body.data))throw new Error(body.error||'Categories unavailable.');
          const names=body.data.map((c:{name:string})=>c.name);localStorage.setItem(cacheKey,JSON.stringify(names));if(active)setCategories(names);
        }catch(e){const saved=JSON.parse(localStorage.getItem(cacheKey)||'null');if(active){if(Array.isArray(saved))setCategories(saved);else setLoadError(e instanceof Error?e.message:'Connect once to load expense categories.');}}
      }
    }).catch(e=>{if(active)setLoadError(e.message);});
    return()=>{active=false;};
  },[]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recentExpenses, setRecentExpenses] = useState<RecentExpense[]>(() => (prefill && prefill.length > 1
    ? prefill.map((row, i) => ({ id: `prefill-${i}`, amount: row.AMOUNT, category: row.CATEGORY, description: row.DESCRIPTION, date: row.DATE, paymentMethod: row['PAYMENT METHOD'], paidTo: row['PAID TO'] }))
    : []));
  const [batchItems, setBatchItems] = useState<any[]>(() => (prefill && prefill.length > 1 ? prefill : []));

  const [formData, setFormData] = useState(() => {
    const row = prefill?.length === 1 ? prefill[0] : null;
    return {
      date: row?.DATE || lagosBusinessDate(),
      amount: row?.AMOUNT ?? "",
      category: row?.CATEGORY ?? "",
      description: row?.DESCRIPTION ?? "",
      paidTo: row?.['PAID TO'] ?? "",
      paymentMethod: row?.['PAYMENT METHOD'] ?? "",
      receiptUrl: "",
      status: (row?.STATUS === "Paid" ? "Paid" : "Unpaid") as "Paid" | "Unpaid",
    };
  });

  const { cachedExpenses } = useSyncStore();

  const uniqueVendors = useMemo(() => {
    const names = new Set<string>();
    cachedExpenses.forEach((e: any) => {
      const n = (e["PAID TO"] || "").trim();
      if (n) names.add(n);
    });
    return Array.from(names).sort();
  }, [cachedExpenses]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > (postgres?20*1024*1024:SYSTEM_DEFAULTS.MAX_UPLOAD_SIZE_BYTES)) {
      toast.error(postgres?"Photo is too large. Max 20 MB before compression.":"File is too large. Max 5MB.");
      return;
    }

    if(!context){toast.error('Wait for your account to load.');return;}
    if(!uploadRequest.current||uploadRequest.current.file!==file)uploadRequest.current={file,id:crypto.randomUUID()};
    setReceiptError('');setFormData(old=>({...old,receiptUrl:''}));
    setIsUploading(true);
    const uploadToast = toast.loading("Uploading receipt...");

    try {
      const uploadFile=postgres?await compressReceipt(file):file;
      if(context.backend==='postgres'){
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await uploadFile.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
        const uploadKey=`bomedia-receipt-upload:${context.staffId}:${hash}`;
        const saved=localStorage.getItem(uploadKey)||crypto.randomUUID();
        localStorage.setItem(uploadKey,saved);
        uploadRequest.current={file,id:saved};
      }
      const formDataUpload = new FormData();
      formDataUpload.append("file", uploadFile);
      if(context.backend==='postgres'){
        formDataUpload.append('requestId',uploadRequest.current!.id);
        formDataUpload.append('expectedStaffId',context.staffId);
      }

      const res = await fetch(postgres?"/api/accounting/receipts":"/api/upload", {
        method: "POST",
        body: formDataUpload,
      });

      const result=await res.json();
      if (!res.ok) throw new Error(result.error||"Upload failed");
      const { url } = result;
      setReceiptSize(`${Math.ceil(file.size/1024)} KB → ${Math.ceil(uploadFile.size/1024)} KB`);
      setFormData((prev) => ({ ...prev, receiptUrl: url }));
      toast.success("Receipt uploaded successfully!", { id: uploadToast });
    } catch (err: any) {
      setReceiptError(err instanceof Error?err.message:'Receipt upload failed.');
      toast.error(
        err instanceof Error?err.message:"Failed to upload receipt. Try again.",
        { id: uploadToast },
      );
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  function postgresItem(row:Record<string,string>):ExpenseItem {
    const amount=nairaToKobo(row.AMOUNT), method=normalizePaymentMethod(row['PAYMENT METHOD']);
    const receiptId=row['RECEIPT URL']?.match(/^\/api\/accounting\/receipts\/([a-f0-9-]+)$/)?.[1];
    if(row['RECEIPT URL']&&!receiptId)throw new Error('This receipt belongs to an older backend. Upload it again for this expense.');
    if(!amount||amount==='0')throw new Error('Enter a positive amount with at most two decimal places.');
    if(row.STATUS==='Paid'&&!method)throw new Error('Choose a payment method for paid expenses.');
    if(!categories.includes(row.CATEGORY))throw new Error('Choose an available expense category. Stock purchases use Restock.');
    return {businessDate:row.DATE,amountKobo:amount,category:row.CATEGORY,description:row.DESCRIPTION,paidTo:row['PAID TO'],status:row.STATUS==='Paid'?'paid':'unpaid',
      ...(row.STATUS==='Paid'?{paymentMethod:method!}:{}),...(receiptId?{receiptId}:{})};
  }
  const currentRow=()=>({DATE:formData.date,AMOUNT:formData.amount,CATEGORY:formData.category,DESCRIPTION:formData.description,'PAID TO':formData.paidTo,'PAYMENT METHOD':formData.paymentMethod,'RECEIPT URL':formData.receiptUrl,STATUS:formData.status});
  function validCurrent() {
    if(!context||isUploading||receiptError){toast.error('Wait for account checks and receipt upload to finish.');return false;}
    if(postgres)try {postgresItem(currentRow());}catch(e){toast.error(e instanceof Error?e.message:'Check expense.');return false;}
    return true;
  }
  const handleReview = () => {
    if(batchItems.length){
      if(formData.amount||formData.description||formData.receiptUrl){toast.error('Add the current expense to the batch before reviewing it.');return;}
      if(isUploading||receiptError||!context)return;
      setShowConfirmModal(true);return;
    }
    if(!validCurrent())return;
    if (!formData.amount || !formData.category || !formData.description) {
      toast.error("Please fill in Amount, Category, and Description.");
      return;
    }
    setShowConfirmModal(true);
  };

  const handleAddToBatch = () => {
    if(!validCurrent())return;
    if (!formData.amount || !formData.category || !formData.description) {
      toast.error("Please fill in Amount, Category, and Description.");
      return;
    }
    const item = {
      DATE: formData.date,
      AMOUNT: formData.amount,
      CATEGORY: formData.category,
      DESCRIPTION: formData.description,
      'PAID TO': formData.paidTo,
      'PAYMENT METHOD': formData.paymentMethod,
      'RECEIPT URL': formData.receiptUrl,
      STATUS: formData.status,
    };

    setBatchItems((prev) => [item, ...prev]);

    const saved: RecentExpense = {
      id: `local-${Date.now()}`,
      amount: formData.amount,
      category: formData.category,
      description: formData.description,
      date: formData.date,
      paymentMethod: formData.paymentMethod,
      paidTo: formData.paidTo,
    };
    setRecentExpenses((prev) => [saved, ...prev].slice(0, 20));

    toast.success(`Added ₦${Number(formData.amount).toLocaleString()} to batch`);

    setFormData({
      date: lagosBusinessDate(),
      amount: "",
      category: "",
      description: "",
      paidTo: formData.paidTo,
      paymentMethod: "",
      receiptUrl: "",
      status: "Unpaid",
    });
  };

  const handleSaveBatch = async () => {
    if (batchItems.length === 0) {
      toast.error("No items in batch to save.");
      return;
    }

    if(postgres){await savePostgres(batchItems);return;}
    try {
      const loggedBy = localStorage.getItem(STORAGE_KEYS.USER_NAME) || "Unknown";
      const items = batchItems.map((it) => ({ ...it, 'Logged By': loggedBy }));

      useSyncStore.getState().addPendingEntry("expense", { batch: true, items });
      const queue = useSyncStore.getState().pendingQueue;
      const entryId = queue[queue.length - 1]?.id ?? "";

      toast.success(`${batchItems.length} expenses logged`, {
        action: {
          label: "Undo",
          onClick: () => {
            useSyncStore.getState().removeEntry(entryId);
            toast.info("Batch removed.");
          },
        },
      });

      setBatchItems([]);
      setRecentExpenses([]);
      setShowConfirmModal(false);
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast.error("Failed to queue batch.");
    }
  };

  async function savePostgres(rows:Record<string,string>[],reason?:string) {
    if(saving.current||isUploading||receiptError)return;
    saving.current=true;setIsSaving(true);
    try {
      const items=rows.map(postgresItem);
      if(context?.backend!=='postgres')throw new Error('Account not ready.');
      expenseContract({version:1,backend:'postgres',requestId:crypto.randomUUID(),expectedStaffId:context.staffId,operation:'log',items});
      if(!reason&&approvalRules&&!approvalRules.isOwner){
        const changes=expenseChanges(items,approvalRules.rules);
        if(changes.length){setAskReason(changes);return;}
      }
      await saveExpenseRequest({operation:'log',items,...(reason?{approvalReason:reason}:{})});
      toast.info(reason?'Sent to the owner for approval. It is recorded once approved.':'Expenses saved on this device. Wait for the confirmed EXP reference.');
      setBatchItems([]);setRecentExpenses([]);setShowConfirmModal(false);setAskReason(null);
      setFormData({date:lagosBusinessDate(),amount:'',category:'',description:'',paidTo:'',paymentMethod:'',receiptUrl:'',status:'Unpaid'});
      onSaved?.();
    }catch(e){toast.error(e instanceof Error?e.message:'Could not save. Your form is unchanged.');}
    finally{saving.current=false;setIsSaving(false);}
  }
  const handleSave = async () => {
    if(postgres){await savePostgres([currentRow()]);return;}
    const loggedBy = localStorage.getItem(STORAGE_KEYS.USER_NAME) || "Unknown";
    const payload = {
      DATE: formData.date,
      AMOUNT: formData.amount,
      CATEGORY: formData.category,
      DESCRIPTION: formData.description,
      "PAID TO": formData.paidTo,
      "PAYMENT METHOD": formData.paymentMethod,
      "RECEIPT URL": formData.receiptUrl,
      "Logged By": loggedBy,
      STATUS: formData.status,
      "PAID BY": formData.status === "Paid" ? loggedBy : "",
      "PAID AT": formData.status === "Paid" ? new Date().toISOString() : "",
    };

    try {
      useSyncStore.getState().addPendingEntry("expense", payload);

      const queue = useSyncStore.getState().pendingQueue;
      const entryId = queue[queue.length - 1]?.id ?? "";

      const saved: RecentExpense = {
        id: entryId,
        amount: formData.amount,
        category: formData.category,
        description: formData.description,
        date: formData.date,
        paymentMethod: formData.paymentMethod,
        paidTo: formData.paidTo,
      };
      setRecentExpenses(prev => [saved, ...prev].slice(0, 5));

      setShowConfirmModal(false);

      toast.success(`₦${Number(formData.amount).toLocaleString()} logged`, {
        description: `${formData.category} · ${formData.description}`,
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            useSyncStore.getState().removeEntry(entryId);
            setRecentExpenses(prev => prev.filter(e => e.id !== entryId));
            toast.info("Expense removed.", { duration: 2000 });
          },
        },
      });
      onSaved?.();

      setFormData({
        date: lagosBusinessDate(),
        amount: "",
        category: "",
        description: "",
        paidTo: "",
        paymentMethod: "",
        receiptUrl: "",
        status: "Unpaid",
      });
    } catch (err) {
      toast.error("Error saving expense locally.");
    }
  };

  return (
    <>
      <Box sx={embedded ? expenseStyles.entryWrapSheet : expenseStyles.entryWrap}>
        <Card sx={embedded ? expenseStyles.entryCardSheet : undefined}>
          {!embedded && <Box sx={styles.header}>
            <Typography variant="h6" sx={styles.headerTitle}>
              Expense Entry
            </Typography>
            <Typography variant="caption" sx={styles.headerCaption}>
              Record business expenses and attach receipts.
            </Typography>
          </Box>}

          <CardContent>
            {loadError&&<Alert severity="warning">{loadError}</Alert>}
            {receiptError&&<Alert severity="warning" action={<Button color="inherit" onClick={()=>setReceiptError('')}>Continue without receipt</Button>}>{receiptError} Retry the upload, or explicitly continue without it.</Alert>}
            {postgres&&embedded&&<Alert severity="info">Stock purchases belong in Restock. Equipment is recorded as an asset. Unpaid expenses receive a payment method when the owner pays them.</Alert>}
            <Box sx={styles.grid}>
              <DatePicker
                label="Date"
                format="DD/MM/YYYY"
                value={formData.date ? dayjs(formData.date) : null}
                onChange={(val) => setFormData({ ...formData, date: val?.format("YYYY-MM-DD") ?? "" })}
                slotProps={{ textField: { size: "small", fullWidth: true, id: "exp-date" } }}
              />

              <TextField
                id="exp-amount"
                label="Amount (₦)"
                type="number"
                fullWidth
                size="small"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                sx={styles.boldInput}
              />

              <Autocomplete
                options={postgres?categories:EXPENSE_CATEGORIES}
                value={formData.category || null}
                onChange={(_, newValue) =>
                  setFormData({ ...formData, category: newValue ?? "" })
                }
                size="small"
                renderInput={(params) => (
                  <TextField {...params} label="Category" />
                )}
              />

              {postgres?<PaidBy value={normalizePaymentMethod(formData.paymentMethod)||''} onChange={paymentMethod=>setFormData({...formData,paymentMethod})} required={formData.status==='Paid'} disabled={formData.status==='Unpaid'} helperText="Choose a method when paying this expense. Unpaid expenses have no payment yet."/>:(
              <Box>
                <FormControl fullWidth size="small">
                  <InputLabel id="exp-method-label" shrink>Method</InputLabel>
                  <Select
                    id="exp-method"
                    labelId="exp-method-label"
                    label="Method"
                    notched
                    disabled={postgres&&formData.status==='Unpaid'}
                    displayEmpty
                    value={formData.paymentMethod}
                    onChange={(e) =>
                      setFormData({ ...formData, paymentMethod: e.target.value })
                    }
                    sx={styles.methodSelect}
                  >
                    <MenuItem value="">Select method</MenuItem>
                    {PAYMENT_METHODS.map((method) => (
                      <MenuItem key={method} value={method}>
                        {method}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>)}

              <SegmentedControl label="Payment status" value={formData.status === "Paid" ? "Paid" : "Unpaid"}
                options={[{ value: "Unpaid", label: "Unpaid" }, { value: "Paid", label: "Paid" }]}
                onChange={(status) => setFormData({ ...formData, status })} />

              <Autocomplete
                freeSolo
                options={uniqueVendors}
                value={formData.paidTo}
                onInputChange={(_, newValue) =>
                  setFormData({ ...formData, paidTo: newValue })
                }
                onChange={(_, newValue) =>
                  setFormData({ ...formData, paidTo: (newValue as string) ?? "" })
                }
                size="small"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    id="exp-paidto"
                    label="Paid to"
                    placeholder="Vendor or person"
                    sx={styles.boldInput}
                  />
                )}
              />

              <Box sx={styles.fullRow}>
                <TextField
                  id="exp-desc"
                  label="Description"
                  fullWidth
                  size="small"
                  placeholder="Reason for expense"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  sx={styles.boldInput}
                />
              </Box>

              <Box sx={styles.fullRow}>
                <Typography component="label" htmlFor="exp-photo" sx={styles.fieldLabelMuted}>
                  Receipt Photo (Optional)
                </Typography>
                <Stack direction="row" sx={styles.receiptRow}>
                  <Box sx={styles.receiptPick}>
                    <Box
                      component="input"
                      id="exp-photo"
                      type="file"
                      accept="image/*"
                      {...({ capture: "environment" } as any)}
                      onChange={handleFileUpload}
                      disabled={isUploading||isSaving||!context}
                      sx={styles.receiptInput}
                    />
                    <Box sx={[styles.receiptTile, formData.receiptUrl ? styles.receiptTileDone : styles.receiptTileEmpty]}>
                      {isUploading ? (
                        <Box component={Loader2} size={20} sx={styles.receiptSpinner} />
                      ) : formData.receiptUrl ? (
                        <Check size={20} />
                      ) : (
                        <Camera size={20} />
                      )}
                      <Typography variant="body2" sx={styles.receiptText}>
                        {isUploading
                          ? "Uploading..."
                          : formData.receiptUrl
                            ? "Photo Attached"
                            : "Take Photo / Upload"}
                      </Typography>
                    </Box>
                  </Box>
                  {formData.receiptUrl && (<Stack spacing={1}><Typography variant="caption">{receiptSize}</Typography><Button component="a" href={formData.receiptUrl} target="_blank" rel="noopener noreferrer">Check receipt readability</Button></Stack>)}
                  {formData.receiptUrl && (
                    <Button
                      size="small"
                      color="error"
                      onClick={() => setFormData({ ...formData, receiptUrl: "" })}
                    >
                      Remove
                    </Button>
                  )}
                </Stack>
              </Box>
            </Box>
          </CardContent>

          <Box sx={styles.footer}>
            <Stack direction="row" sx={styles.footerButtons}>
              <Button
                variant="outlined"
                fullWidth
                disabled={!context||isSaving||isUploading}
                onClick={handleAddToBatch}
                sx={styles.footerButton}
              >
                Add to Batch
              </Button>
              <Button
                variant="contained"
                fullWidth
                disabled={!context||isSaving||isUploading}
                onClick={handleReview}
                sx={styles.footerButton}
              >
                Review & Save
              </Button>
            </Stack>
          </Box>
        </Card>
      </Box>

      {recentExpenses.length > 0 && (
        <Box sx={styles.recent}>
          <Card>
            <Box sx={styles.recentHead}>
              <Stack direction="row" sx={styles.recentTitleRow}>
                <Box component="span" sx={expenseStyles.sessionIcon}><Receipt size={14} /></Box>
                <Typography sx={styles.recentTitle}>
                  This Session
                </Typography>
              </Stack>
              <Typography sx={styles.recentCount}>
                {recentExpenses.length} logged
              </Typography>
            </Box>
            <List disablePadding>
              {recentExpenses.map((exp, i) => (
                <ListItem
                  key={exp.id}
                  sx={[styles.recentItem, i === recentExpenses.length - 1 && styles.recentItemLast]}
                >
                  <Box sx={styles.itemMain}>
                    <Typography sx={styles.itemTitle}>
                      {exp.category}
                    </Typography>
                    <Typography sx={styles.itemSub}>
                      {exp.description}{exp.paidTo ? ` · ${exp.paidTo}` : ""} · {exp.paymentMethod}
                    </Typography>
                  </Box>
                  <Typography sx={styles.recentAmount}>
                    ₦{Number(exp.amount).toLocaleString()}
                  </Typography>
                </ListItem>
              ))}
            </List>
          </Card>
        </Box>
      )}

      <ApprovalReasonSheet open={askReason!==null} changes={askReason??[]} busy={isSaving} description="This expense is above the owner’s limit. It will not be recorded and no money counts as paid out until the owner approves it." backLabel="Change the amount"
        onSend={(reason)=>{void savePostgres(batchItems.length?batchItems:[currentRow()],reason);}} onClose={()=>setAskReason(null)} />

      <Dialog
        open={showConfirmModal}
        onClose={() => {if(!isSaving)setShowConfirmModal(false);}}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: styles.dialogPaper } }}
      >
        <DialogTitle sx={styles.dialogTitle}>
          {batchItems.length > 0 ? "Confirm Expenses" : "Confirm Expense"}
          <Typography variant="caption" sx={styles.dialogCaption}>
            Review the details before saving your expense.
          </Typography>
        </DialogTitle>

        <DialogContent sx={styles.dialogBody}>
          {batchItems.length > 0 ? (
            <Box>
              <Box sx={styles.batchHead}>
                <Box>
                  <Typography sx={styles.batchTitle}>Batch Preview</Typography>
                  <Typography variant="caption" sx={styles.batchCaption}>
                    {batchItems.length} items ready to save
                  </Typography>
                </Box>
              </Box>
              <List disablePadding sx={styles.batchList}>
                {batchItems.map((b, i) => (
                  <ListItem
                    key={i}
                    sx={[styles.batchItem, i === batchItems.length - 1 && styles.batchItemLast]}
                  >
                    <Box sx={styles.itemMain}>
                      <Typography sx={styles.itemTitle}>
                        {b.CATEGORY}
                      </Typography>
                      <Typography sx={styles.itemSub}>
                        {b.DESCRIPTION}
                      </Typography>
                    </Box>
                    <Typography sx={styles.batchAmount}>
                      ₦{parseAmount(b.AMOUNT).toLocaleString()}
                    </Typography>
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : (
            <Box sx={styles.summary}>
              <Box>
                <Typography sx={styles.fieldLabel}>Date</Typography>
                <Typography sx={styles.value}>{formData.date}</Typography>
              </Box>
              <Box>
                <Typography sx={styles.fieldLabel}>Category</Typography>
                <Typography sx={styles.value}>{formData.category}</Typography>
              </Box>
              <Box>
                <Typography sx={styles.fieldLabel}>Method</Typography>
                <Typography sx={styles.value}>{formData.status==='Unpaid'?'Not paid yet':formData.paymentMethod}</Typography>
              </Box>
              <Box>
                <Typography sx={styles.fieldLabel}>Amount</Typography>
                <Typography sx={styles.amountValue}>
                  ₦{Number(formData.amount).toLocaleString()}
                </Typography>
              </Box>
              <Box sx={styles.cellLeft}>
                <Typography sx={styles.fieldLabel}>Paid To</Typography>
                <Typography sx={styles.value}>{formData.paidTo || "—"}</Typography>
              </Box>
              <Box sx={styles.cellRight}>
                <Typography sx={styles.fieldLabel}>Status</Typography>
                <Box component="span" sx={[styles.statusChip, formData.status === "Paid" ? styles.statusChipPaid : styles.statusChipOpen]}>
                  {formData.status}
                </Box>
              </Box>
              <Box sx={styles.cellFull}>
                <Typography sx={styles.fieldLabel}>Description</Typography>
                <Typography sx={styles.descriptionValue}>{formData.description}</Typography>
              </Box>
              {formData.receiptUrl && (
                <Box sx={styles.cellReceipt}>
                  <Typography sx={styles.fieldLabelSpaced}>Receipt Preview</Typography>
                  <Box component="img" src={formData.receiptUrl} alt="Receipt" sx={expenseStyles.receiptPreview} />
                </Box>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={styles.dialogActions}>
          <Button
            variant="outlined"
            disabled={isSaving}
            onClick={() => setShowConfirmModal(false)}
            sx={styles.dialogButton}
          >
            Edit
          </Button>
          {batchItems.length > 0 ? (
            <Button
              variant="contained"
              onClick={handleSaveBatch}
              disabled={isSaving||isUploading||!context}
              sx={styles.dialogButton}
            >
              Save {batchItems.length} Items
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={isSaving||isUploading||!context}
              sx={styles.dialogButton}
            >
              Confirm Save
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
