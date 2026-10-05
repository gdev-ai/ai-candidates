"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Search,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";

import { DashboardNav } from "@/components/dashboard/nav";
import { RequirementsEditor } from "@/components/jobs/RequirementsEditor";
import { SearchQueries } from "@/components/jobs/SearchQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  EMPLOYMENT_TYPE_VALUES as EMPLOYMENT_TYPES,
  WORK_ARRANGEMENT_VALUES as WORK_ARRANGEMENTS,
  analysisToDraft,
  type AnalysisLike,
  type RequirementsDraft,
} from "@/types/job";

type InputMode = "paste" | "upload";

/** GET /api/search/[runId]/status (see docs/api-contract.md #5). */
interface RunStatus {
  status: string;
  error: string | null;
  candidates_found: number | null;
  candidates_new: number | null;
  started_at: string | null;
  completed_at: string | null;
}

const TERMINAL_RUN_STATUSES = new Set(["complete", "error", "cancelled"]);

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorOf(data: Record<string, unknown>, fallback: string): string {
  return typeof data.error === "string" && data.error ? data.error : fallback;
}

export default function NewJobPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Accordion state
  const [isJobDetailsOpen, setIsJobDetailsOpen] = useState(true);
  const [isJdOpen, setIsJdOpen] = useState(true);

  // Job details
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [employmentType, setEmploymentType] = useState("");
  const [workArrangement, setWorkArrangement] = useState("");
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingCompanies(true);
    setCompaniesError(null);
    fetch("/api/companies", { signal: controller.signal })
      .then(async (res) => {
        const data = await readJson(res);
        if (!res.ok) {
          setCompaniesError(errorOf(data, "Failed to load companies."));
          return;
        }
        setCompanies((data.companies as { id: string; name: string }[] | undefined) ?? []);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCompaniesError("Failed to load companies.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingCompanies(false);
      });
    return () => controller.abort();
  }, []);

  const selectedCompanyName = companies.find((c) => c.id === companyId)?.name ?? null;

  // Job description & file upload
  const [mode, setMode] = useState<InputMode>("upload");
  const [description, setDescription] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileSize, setUploadedFileSize] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // AI analysis -> editable requirements. The analysis itself is never
  // posted back: the server copies it from the logged call (analysisCallId).
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RequirementsDraft | null>(null);
  const [analysisCallId, setAnalysisCallId] = useState<string | null>(null);

  // Save -> queries -> search
  const [savedJobId, setSavedJobId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [queries, setQueries] = useState<string[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);

  // Success modal
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  const jobDetailsErrors: Record<string, string> = {};
  if (!title.trim()) jobDetailsErrors.title = "Job title is required.";
  if (!companyId) jobDetailsErrors.company = "Company is required.";
  if (!employmentType) jobDetailsErrors.employmentType = "Employment type is required.";
  if (!workArrangement) jobDetailsErrors.workArrangement = "Work arrangement is required.";
  const isJobDetailsValid = Object.keys(jobDetailsErrors).length === 0;
  const isRangeValid =
    !draft ||
    draft.min_experience === null ||
    draft.max_experience === null ||
    draft.min_experience <= draft.max_experience;

  function markAllFieldsTouched() {
    setTouchedFields({ title: true, company: true, employmentType: true, workArrangement: true });
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  async function processFile(file: File) {
    setExtractError(null);
    setIsExtracting(true);
    setUploadedFileName(file.name);
    setUploadedFileSize(formatFileSize(file.size));
    toast.info(`Extracting text from ${file.name}...`, "Processing File");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/files/extract", { method: "POST", body: formData });
      const data = await readJson(response);

      if (!response.ok) {
        const msg = errorOf(data, "Failed to extract text from file.");
        setExtractError(msg);
        toast.error(msg);
        return;
      }

      setDescription(typeof data.text === "string" ? data.text : "");
      toast.success(`Extracted content from ${file.name}`, "Upload Successful");
    } catch {
      setExtractError("Failed to upload or process the file.");
      toast.error("Failed to upload or process the file.");
    } finally {
      setIsExtracting(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleRemoveFile() {
    setUploadedFileName(null);
    setUploadedFileSize(null);
    setDescription("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** Anything edited after queries were generated makes them stale. */
  function handleDraftChange(updated: RequirementsDraft) {
    setDraft(updated);
    if (queries && !runId) setQueries(null);
  }

  async function handleAnalyze() {
    if (description.trim().length < 50) return;

    setIsJobDetailsOpen(false);
    setIsJdOpen(false);
    setAnalyzeError(null);
    setIsAnalyzing(true);
    toast.info("Analyzing job description with AI...", "Processing JD");

    try {
      const response = await fetch("/api/jobs/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await readJson(response);

      if (!response.ok || !data.analysis || typeof data.analysis !== "object") {
        const msg = errorOf(data, "Failed to analyze the job description.");
        setAnalyzeError(msg);
        toast.error(msg);
        return;
      }

      const analysis = data.analysis as AnalysisLike;
      setDraft(analysisToDraft(analysis));
      setAnalysisCallId(typeof data.analysisCallId === "string" ? data.analysisCallId : null);
      setQueries(null);
      if (!title && analysis.job_title) setTitle(analysis.job_title);
      if (
        !employmentType &&
        analysis.employment_type &&
        (EMPLOYMENT_TYPES as readonly string[]).includes(analysis.employment_type)
      ) {
        setEmploymentType(analysis.employment_type);
      }
      toast.success("Requirements extracted from the job description.", "Analysis Complete");
    } catch {
      setAnalyzeError("Failed to analyze the job description.");
      toast.error("Failed to analyze the job description.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  /** Creates the job (or updates it if already saved), then generates queries. */
  async function handleSaveAndGenerate() {
    if (!draft || isSaving) return;
    if (!isJobDetailsValid || !isRangeValid) {
      markAllFieldsTouched();
      if (!isJobDetailsValid) setIsJobDetailsOpen(true);
      const msg = !isJobDetailsValid
        ? "Please complete all required job details before continuing."
        : "Minimum experience can't be more than maximum.";
      setSearchError(msg);
      toast.error(msg, "Missing Required Fields");
      return;
    }

    setSearchError(null);
    setIsSaving(true);

    const fields = {
      title: title.trim(),
      description,
      company_id: companyId,
      employment_type: employmentType,
      work_arrangement: workArrangement,
      seniority: draft.seniority,
      city: draft.city,
      min_experience: draft.min_experience,
      max_experience: draft.max_experience,
      requirements: draft.requirements,
    };

    try {
      let jobId = savedJobId;
      const jobResponse = jobId
        ? await fetch(`/api/jobs/${jobId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields),
          })
        : await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...fields, ...(analysisCallId ? { analysisCallId } : {}) }),
          });
      const jobData = await readJson(jobResponse);
      if (!jobResponse.ok) {
        const msg = errorOf(jobData, "Failed to save the job.");
        setSearchError(msg);
        toast.error(msg);
        return;
      }
      if (!jobId) {
        jobId = (jobData.job as { id: string } | undefined)?.id ?? null;
        if (!jobId) {
          setSearchError("Failed to save the job.");
          return;
        }
        setSavedJobId(jobId);
      }

      toast.info("Generating search queries...", "Job Saved");
      const queryResponse = await fetch("/api/jobs/generate-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const queryData = await readJson(queryResponse);
      if (!queryResponse.ok || !Array.isArray(queryData.queries)) {
        const msg = errorOf(queryData, "Failed to generate search queries.");
        setSearchError(msg);
        toast.error(msg);
        return;
      }
      setQueries((queryData.queries as unknown[]).filter((q): q is string => typeof q === "string"));
      toast.success("Review the search queries, then start the search.", "Queries Ready");
    } catch {
      setSearchError("Failed to save the job or generate queries.");
      toast.error("Failed to save the job or generate queries.");
    } finally {
      setIsSaving(false);
    }
  }

  async function pollRun(currentRunId: string) {
    // Enrichment can take several minutes; keep polling well past that.
    const POLL_INTERVAL_MS = 2500;
    const MAX_WAIT_MS = 15 * 60 * 1000;
    const deadline = Date.now() + MAX_WAIT_MS;

    while (Date.now() < deadline) {
      let res: Response;
      let data: Record<string, unknown>;
      try {
        res = await fetch(`/api/search/${currentRunId}/status`);
        data = await readJson(res);
      } catch {
        // A dropped poll shouldn't abort a run that's still going server-side.
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      if (!res.ok) {
        const msg = errorOf(data, "Failed to check search status.");
        setSearchError(msg);
        toast.error(msg, "Search Error");
        return;
      }

      const run = data as unknown as RunStatus;
      setRunStatus(run);

      if (TERMINAL_RUN_STATUSES.has(run.status)) {
        if (run.status === "complete") {
          setIsSuccessModalOpen(true);
          toast.success(`Found ${run.candidates_found ?? 0} candidates.`, "Sourcing Complete");
        } else {
          const msg = run.error || (run.status === "cancelled" ? "The search was cancelled." : "The search failed.");
          setSearchError(msg);
          toast.error(msg, "Sourcing Failed");
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    setSearchError("The search is taking longer than expected. Check the job's candidates shortly.");
    toast.warning("The search is taking longer than expected. Check back shortly.");
  }

  async function handleStartSearch() {
    if (!savedJobId || !queries || isSearching) return;
    const cleaned = queries.map((q) => q.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      setSearchError("Add at least one search query.");
      return;
    }

    setSearchError(null);
    setIsSearching(true);
    setRunStatus(null);
    toast.info("Searching for candidates...", "Sourcing Started");

    try {
      const res = await fetch(`/api/jobs/${savedJobId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: cleaned }),
      });
      const data = await readJson(res);
      const run = data.run as { id: string; status: string } | undefined;
      if (!res.ok || !run?.id) {
        const msg = errorOf(data, "Failed to start the candidate search.");
        setSearchError(msg);
        toast.error(msg);
        return;
      }
      setRunId(run.id);
      await pollRun(run.id);
    } catch {
      setSearchError("An unexpected error occurred during candidate sourcing.");
      toast.error("An unexpected error occurred during candidate sourcing.");
    } finally {
      setIsSearching(false);
    }
  }

  const candidatesHref = savedJobId
    ? `/candidates?jobId=${savedJobId}${runId ? `&runId=${runId}` : ""}`
    : "/candidates";

  return (
    <main className="min-h-screen bg-slate-50/70 pb-24">
      <DashboardNav />
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
            AI Talent Pipeline
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
            Create New Job Opening
          </h1>
          <p className="text-sm text-slate-500">
            Provide the role details and job description. The AI extracts the requirements, you
            review them and the search queries, then candidates are sourced and scored.
          </p>
        </div>

        {/* 1. Job Details Accordion */}
        <Card className="shadow-sm border-slate-200 transition-all">
          <CardHeader
            className="cursor-pointer select-none pb-4 border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
            onClick={() => setIsJobDetailsOpen((prev) => !prev)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 font-semibold text-sm">
                  1
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Job Details
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    {isJobDetailsOpen
                      ? "Specify job title, company, and employment structure"
                      : `${title || "Role Title"} • ${selectedCompanyName || "Company"} • ${employmentType || "Full-time"} • ${workArrangement || "Remote"}`}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isJobDetailsOpen && (
                  <Badge tone="neutral" className="text-xs font-normal">
                    {title || "Configured"}
                  </Badge>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500">
                  {isJobDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>

          {isJobDetailsOpen && (
            <CardContent className="pt-6 flex flex-col gap-5 animate-in fade-in duration-200">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="job-title" className="text-xs font-semibold text-slate-700">
                  Job Title <span className="text-red-600">*</span>
                </label>
                <Input
                  id="job-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setTouchedFields((prev) => ({ ...prev, title: true }))}
                  placeholder="e.g. Senior React Developer"
                  className="bg-white"
                  aria-invalid={touchedFields.title && !!jobDetailsErrors.title}
                  data-testid="job-title-input"
                />
                {touchedFields.title && jobDetailsErrors.title && (
                  <p role="alert" className="text-xs font-medium text-red-600">
                    {jobDetailsErrors.title}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="job-company" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  Company <span className="text-red-600">*</span>
                </label>
                <Select
                  value={companyId}
                  onValueChange={(value) => {
                    setCompanyId(value);
                    setTouchedFields((prev) => ({ ...prev, company: true }));
                  }}
                  disabled={isLoadingCompanies}
                >
                  <SelectTrigger
                    id="job-company"
                    className="bg-white"
                    aria-invalid={touchedFields.company && !!jobDetailsErrors.company}
                    data-testid="job-company-trigger"
                  >
                    <SelectValue
                      placeholder={isLoadingCompanies ? "Loading companies..." : "Select a company"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {touchedFields.company && jobDetailsErrors.company && (
                  <p role="alert" className="text-xs font-medium text-red-600">
                    {jobDetailsErrors.company}
                  </p>
                )}
                {companiesError && (
                  <p role="alert" className="text-xs font-medium text-red-600">
                    {companiesError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-700">
                    Employment Type <span className="text-red-600">*</span>
                  </span>
                  <Select
                    value={employmentType}
                    onValueChange={(value) => {
                      setEmploymentType(value);
                      setTouchedFields((prev) => ({ ...prev, employmentType: true }));
                    }}
                  >
                    <SelectTrigger className="bg-white" data-testid="job-employment-type-trigger">
                      <SelectValue placeholder="Select type (e.g. Full-time)" />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {touchedFields.employmentType && jobDetailsErrors.employmentType && (
                    <p role="alert" className="text-xs font-medium text-red-600">
                      {jobDetailsErrors.employmentType}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-slate-700">
                    Work Arrangement <span className="text-red-600">*</span>
                  </span>
                  <Select
                    value={workArrangement}
                    onValueChange={(value) => {
                      setWorkArrangement(value);
                      setTouchedFields((prev) => ({ ...prev, workArrangement: true }));
                    }}
                  >
                    <SelectTrigger className="bg-white" data-testid="job-work-arrangement-trigger">
                      <SelectValue placeholder="Select arrangement (e.g. Remote)" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_ARRANGEMENTS.map((arrangement) => (
                        <SelectItem key={arrangement} value={arrangement}>
                          {arrangement}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {touchedFields.workArrangement && jobDetailsErrors.workArrangement && (
                    <p role="alert" className="text-xs font-medium text-red-600">
                      {jobDetailsErrors.workArrangement}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsJobDetailsOpen(false)}
                  className="text-xs text-slate-600"
                >
                  Save & Collapse
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* 2. Job Description Accordion */}
        <Card className="shadow-sm border-slate-200 transition-all">
          <CardHeader
            className="cursor-pointer select-none pb-4 border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
            onClick={() => setIsJdOpen((prev) => !prev)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 font-semibold text-sm">
                  2
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Job Description
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    {isJdOpen
                      ? "Upload a document or paste the raw job description"
                      : uploadedFileName
                        ? `File: ${uploadedFileName} (${uploadedFileSize})`
                        : description
                          ? `${description.slice(0, 60)}...`
                          : "Empty job description"}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isJdOpen && description && (
                  <Badge tone="good" className="text-xs font-normal">
                    {uploadedFileName ? "File Attached" : `${description.length} chars`}
                  </Badge>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500">
                  {isJdOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>

          {isJdOpen && (
            <CardContent className="pt-6 flex flex-col gap-5 animate-in fade-in duration-200">
              
              {/* Mode Toggle */}
              <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setMode("upload")}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                    mode === "upload"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  Upload File (PDF / DOCX)
                </button>
                <button
                  type="button"
                  onClick={() => setMode("paste")}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                    mode === "paste"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Paste Text
                </button>
              </div>

              {/* Upload Mode: Redesigned Drag & Drop Area */}
              {mode === "upload" ? (
                <div className="flex flex-col gap-3">
                  <input
                    ref={fileInputRef}
                    data-testid="jd-file-input"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {!uploadedFileName ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center",
                        isDragging
                          ? "border-indigo-500 bg-indigo-50/50"
                          : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50/80"
                      )}
                    >
                      <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3 shadow-xs">
                        <UploadCloud className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        Click to upload or drag & drop file
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Supports PDF, DOCX, or TXT documents up to 10MB
                      </p>
                      <div className="flex items-center gap-2 mt-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">PDF</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">DOCX</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">TXT</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between p-4 rounded-xl border border-indigo-100 bg-indigo-50/40">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                            DOC
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{uploadedFileName}</p>
                            <p className="text-xs text-slate-500">{uploadedFileSize} • Ready for analysis</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs h-8 bg-white"
                          >
                            Change File
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleRemoveFile}
                            className="h-8 w-8 text-slate-400 hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {description && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 max-h-40 overflow-y-auto leading-relaxed">
                          <span className="font-semibold text-slate-900 block mb-1">Extracted Text Preview:</span>
                          {description}
                        </div>
                      )}
                    </div>
                  )}

                  {isExtracting && (
                    <div className="flex items-center gap-2 text-xs font-medium text-indigo-600">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Parsing text from {uploadedFileName}...
                    </div>
                  )}

                  {extractError && (
                    <p role="alert" className="text-xs font-medium text-red-600">
                      {extractError}
                    </p>
                  )}
                </div>
              ) : (
                /* Paste Text Mode */
                <div className="flex flex-col gap-2">
                  <Textarea
                    data-testid="jd-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Paste the full job description here (responsibilities, technical requirements, qualifications)..."
                    rows={10}
                    className="bg-white text-sm leading-relaxed"
                  />
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>Minimum 50 characters required</span>
                    <span>{description.length} characters</span>
                  </div>
                </div>
              )}

              {/* Action: Analyze Job Button */}
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                <Button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || description.trim().length < 50}
                  className="w-full sm:w-auto self-end bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                >
                  Analyze Job with AI
                </Button>
                {analyzeError && (
                  <p role="alert" className="text-xs font-medium text-red-600 text-right">
                    {analyzeError}
                  </p>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* 3. Loading Screen when Analyzing */}
        {isAnalyzing && (
          <Card className="p-8 text-center animate-in fade-in duration-300">
            <div className="flex flex-col items-center justify-center max-w-md mx-auto">
              <div className="relative mb-5">
                <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 animate-pulse">
                  <FileText className="h-8 w-8" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
              </div>
              <h3 className="font-display text-xl font-bold text-slate-900">
                Analyzing Job Description...
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Our AI model is extracting required technical skills, preferred competencies, seniority level, and candidate qualifications.
              </p>
              <div className="w-full bg-indigo-100 rounded-full h-1.5 mt-6 overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full animate-indeterminate" />
              </div>
            </div>
          </Card>
        )}
        {/* 4. Extracted requirements */}
        {draft && (
          <Card className="animate-in fade-in border-slate-200 shadow-sm duration-300">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display text-xl font-bold text-slate-900">
                    Extracted Requirements
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Review and fine-tune what the AI extracted before saving the job
                  </CardDescription>
                </div>
                <Badge tone={savedJobId ? "good" : "neutral"} className="text-xs font-medium">
                  {savedJobId ? "Job saved" : "Not saved yet"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <RequirementsEditor value={draft} onChange={handleDraftChange} />

              <div className="mt-8 bg-black p-6 text-white">
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h4 className="flex items-center gap-2 text-base font-bold text-white">
                      <Sparkles className="h-4 w-4 text-indigo-400" />
                      {queries ? "Search Queries" : "Save & Build Search Queries"}
                    </h4>
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-300">
                      {queries
                        ? "Edit, remove or add queries, then start the search. Location targeting is added automatically."
                        : "Saves the job with these requirements and generates targeted search queries for you to review."}
                    </p>
                  </div>
                  {!queries && (
                    <Button
                      type="button"
                      size="lg"
                      onClick={handleSaveAndGenerate}
                      disabled={isSaving || isSearching || !isJobDetailsValid || !isRangeValid}
                      className="shrink-0 bg-indigo-600 font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-60"
                      data-testid="save-generate-button"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          {savedJobId ? "Update Job & Regenerate Queries" : "Save Job & Generate Queries"}
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {!isJobDetailsValid && (
                  <p className="mt-3 text-xs text-amber-300">
                    Complete all required job details above (title, company, employment type, work
                    arrangement) to continue.
                  </p>
                )}

                {queries && (
                  <div className="mt-5 rounded-xl bg-white p-4 text-slate-900" data-testid="queries-review">
                    <SearchQueries queries={queries} onChange={setQueries} />
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSaveAndGenerate}
                        disabled={isSaving || isSearching}
                      >
                        {isSaving ? "Regenerating..." : "Regenerate"}
                      </Button>
                      <Button
                        type="button"
                        onClick={handleStartSearch}
                        disabled={isSearching || isSaving || queries.every((q) => !q.trim())}
                        className="bg-indigo-600 font-semibold text-white hover:bg-indigo-500"
                        data-testid="find-candidates-button"
                      >
                        {isSearching ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Finding Candidates...
                          </>
                        ) : (
                          <>
                            <Search className="mr-2 h-4 w-4" />
                            Start Search
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {isSearching && (
                  <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4 text-xs text-indigo-200" data-testid="search-progress">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                    <span>
                      {!runStatus || runStatus.status === "pending"
                        ? "Starting the search..."
                        : `Searching and scoring candidates · ${runStatus.candidates_found ?? 0} found so far`}
                    </span>
                  </div>
                )}

                {searchError && (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/20 p-3 text-xs text-red-200" role="alert">
                    {searchError}
                    {savedJobId && (
                      <button
                        type="button"
                        onClick={() => router.push(candidatesHref)}
                        className="ml-2 underline underline-offset-2"
                      >
                        Open the job&apos;s candidates
                      </button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 5. Success modal */}
      {isSuccessModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm duration-200"
        >
          <div className="animate-in zoom-in-95 relative w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl ring-1 ring-slate-900/10 duration-200 sm:p-8">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <h2 className="font-display text-2xl font-bold text-slate-900">Candidate Sourcing Complete!</h2>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Found{" "}
              <span className="text-base font-bold text-slate-900">
                {runStatus?.candidates_found ?? 0} candidates
              </span>
              {runStatus?.candidates_new ? ` (${runStatus.candidates_new} new to the database)` : ""} for{" "}
              <span className="font-medium text-slate-900">{title || "this role"}</span>.
            </p>

            {selectedCompanyName && (
              <p className="mt-1 text-xs text-slate-400">
                Company: <span className="font-medium text-slate-600">{selectedCompanyName}</span>
              </p>
            )}

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSuccessModalOpen(false)}
                className="w-full text-slate-700 hover:bg-slate-50 sm:w-1/2"
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setIsSuccessModalOpen(false);
                  router.push(candidatesHref);
                }}
                className="w-full bg-indigo-600 font-medium text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 sm:w-1/2"
              >
                Show Candidates
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
