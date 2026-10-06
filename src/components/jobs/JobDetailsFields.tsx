"use client";

import { Building2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  EMPLOYMENT_TYPE_VALUES as EMPLOYMENT_TYPES,
  MISSING_FIELD_CLASS,
  WORK_ARRANGEMENT_VALUES as WORK_ARRANGEMENTS,
} from "@/types/job";

export interface JobDetailsValue {
  title: string;
  companyId: string;
  employmentType: string;
  workArrangement: string;
}

/** Required-field errors for the job details, keyed by field. */
export function jobDetailsErrorsOf(
  value: JobDetailsValue,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!value.title.trim()) errors.title = "Job title is required.";
  if (!value.companyId) errors.company = "Company is required.";
  if (!value.employmentType)
    errors.employmentType = "Employment type is required.";
  if (!value.workArrangement)
    errors.workArrangement = "Work arrangement is required.";
  return errors;
}

/**
 * Title, company, employment type and work arrangement: the job details
 * shown at the top of the requirements card (New Job and Adapt search).
 */
export function JobDetailsFields({
  value,
  onChange,
  companies,
  isLoadingCompanies,
  companiesError,
  touchedFields,
  setTouchedFields,
}: {
  value: JobDetailsValue;
  onChange: (patch: Partial<JobDetailsValue>) => void;
  companies: { id: string; name: string }[];
  isLoadingCompanies: boolean;
  companiesError: string | null;
  touchedFields: Record<string, boolean>;
  setTouchedFields: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const { title, companyId, employmentType, workArrangement } = value;
  const setTitle = (v: string) => onChange({ title: v });
  const setCompanyId = (v: string) => onChange({ companyId: v });
  const setEmploymentType = (v: string) => onChange({ employmentType: v });
  const setWorkArrangement = (v: string) => onChange({ workArrangement: v });
  const jobDetailsErrors = jobDetailsErrorsOf(value);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="job-title"
          className="text-xs font-semibold text-slate-700"
        >
          Job Title <span className="text-red-600">*</span>
        </label>
        <Input
          id="job-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTouchedFields((prev) => ({ ...prev, title: true }))}
          placeholder="e.g. Senior React Developer"
          className={cn("bg-white", !title.trim() && MISSING_FIELD_CLASS)}
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
        <label
          htmlFor="job-company"
          className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
        >
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
            className={cn("bg-white", !companyId && MISSING_FIELD_CLASS)}
            aria-invalid={touchedFields.company && !!jobDetailsErrors.company}
            data-testid="job-company-trigger"
          >
            <SelectValue
              placeholder={
                isLoadingCompanies ? "Loading companies..." : "Select a company"
              }
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
            <SelectTrigger
              className={cn("bg-white", !employmentType && MISSING_FIELD_CLASS)}
              data-testid="job-employment-type-trigger"
            >
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
            <SelectTrigger
              className={cn(
                "bg-white",
                !workArrangement && MISSING_FIELD_CLASS,
              )}
              data-testid="job-work-arrangement-trigger"
            >
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
          {touchedFields.workArrangement &&
            jobDetailsErrors.workArrangement && (
              <p role="alert" className="text-xs font-medium text-red-600">
                {jobDetailsErrors.workArrangement}
              </p>
            )}
        </div>
      </div>
    </>
  );
}
