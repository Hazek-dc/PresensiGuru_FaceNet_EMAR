<?php

use App\Http\Controllers\ProfileController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::redirect('/', '/login');

// Presensi Frontend & Proxy API (Accessible for both Personal and Kiosk)
Route::get('/presensi', [\App\Http\Controllers\PresensiController::class, 'index'])->name('presensi');
Route::get('/attendance/capture', [\App\Http\Controllers\PresensiController::class, 'index'])->name('attendance.capture');
Route::post('/api/presensi', [\App\Http\Controllers\PresensiController::class, 'store'])->name('api.presensi');
Route::post('/presensi/verify', [\App\Http\Controllers\PresensiController::class, 'store'])->name('presensi.verify');
Route::get('/presensi/export-bab5', [\App\Http\Controllers\PresensiController::class, 'exportBab5'])->name('presensi.export-bab5');

// Lux Measurement & Luxometer Integration API
Route::get('/api/lux/current', [\App\Http\Controllers\LuxController::class, 'current'])->name('api.lux.current');
Route::post('/api/lux/update', [\App\Http\Controllers\LuxController::class, 'update'])->name('api.lux.update');

// Distance Measurement & Rangefinder Integration API
Route::get('/api/distance/current', [\App\Http\Controllers\DistanceController::class, 'current'])->name('api.distance.current');
Route::post('/api/distance/update', [\App\Http\Controllers\DistanceController::class, 'update'])->name('api.distance.update');

Route::get('/dashboard', [\App\Http\Controllers\DashboardController::class, 'index'])->middleware(['auth', 'verified'])->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::post('/dashboard/activities/preview', [\App\Http\Controllers\DashboardController::class, 'previewHideToday'])->name('dashboard.activities.preview');
    Route::post('/dashboard/activities/hide', [\App\Http\Controllers\DashboardController::class, 'commitHideToday'])->name('dashboard.activities.hide');
    Route::delete('/dashboard/activities/clear-all', [\App\Http\Controllers\DashboardController::class, 'clearAllAttendanceActivities'])->name('dashboard.activities.clear-all');
    Route::post('/dashboard/activities/clear-all', [\App\Http\Controllers\DashboardController::class, 'clearAllAttendanceActivities'])->name('dashboard.activities.clear-all.post');

    // Face Enrollment Manual Routes
    Route::get('/api/presensi/enroll/subjects', [\App\Http\Controllers\ManualEnrollmentController::class, 'subjects'])->name('api.presensi.enroll.subjects');
    Route::post('/api/presensi/enroll/preview', [\App\Http\Controllers\ManualEnrollmentController::class, 'preview'])->name('api.presensi.enroll.preview');
    Route::post('/api/presensi/enroll/commit', [\App\Http\Controllers\ManualEnrollmentController::class, 'commit'])->name('api.presensi.enroll.commit');

    // Teacher Face Enrollment (Pendaftaran Wajah Mandiri Guru)
    Route::get('/teacher/enrollment', [\App\Http\Controllers\TeacherEnrollmentController::class, 'index'])->name('teacher.enrollment');
    Route::post('/teacher/enrollment', [\App\Http\Controllers\TeacherEnrollmentController::class, 'store'])->name('teacher.enrollment.store');
    Route::delete('/teacher/enrollment', [\App\Http\Controllers\TeacherEnrollmentController::class, 'destroy'])->name('teacher.enrollment.destroy');

    Route::get('/attendance/history', [\App\Http\Controllers\AttendanceHistoryController::class, 'index'])->name('attendance.history');
    Route::get('/attendance/export/operational', [\App\Http\Controllers\AttendanceHistoryController::class, 'exportOperational'])->name('export.operational');
    Route::get('/attendance/export/research', [\App\Http\Controllers\AttendanceHistoryController::class, 'exportResearch'])->name('export.research');
    Route::get('/attendance/export/cochran', [\App\Http\Controllers\AttendanceHistoryController::class, 'exportCochran'])->name('export.cochran');
    Route::get('/attendance/export/cochran-dataset', [\App\Http\Controllers\AttendanceHistoryController::class, 'exportCochran'])->name('attendance.export.cochran');
    Route::get('/attendance/export/bab5', [\App\Http\Controllers\PresensiController::class, 'exportBab5'])->name('attendance.export.bab5');
    Route::get('/attendance/export/subject/{id}', [\App\Http\Controllers\AttendanceHistoryController::class, 'exportSubject'])->name('attendance.export.subject');
    Route::get('/attendance/export/latest', [\App\Http\Controllers\AttendanceHistoryController::class, 'exportLatest'])->name('attendance.export.latest');
    Route::get('/attendance/export/pdf-data', [\App\Http\Controllers\AttendanceHistoryController::class, 'exportPdfData'])->name('attendance.export.pdf-data');
    Route::get('/attendance/export/activities', [\App\Http\Controllers\AttendanceHistoryController::class, 'exportActivities'])->name('attendance.export.activities');
    Route::get('/attendance/export/print', [\App\Http\Controllers\AttendanceHistoryController::class, 'printReport'])->name('attendance.export.print');
    Route::get('/attendance/history/{id}', [\App\Http\Controllers\AttendanceHistoryController::class, 'show'])->name('attendance.show');
    Route::delete('/attendance/history/{id}', [\App\Http\Controllers\AttendanceHistoryController::class, 'destroy'])->name('attendance.destroy');
    Route::delete('/attendance/activities/{id}', [\App\Http\Controllers\AttendanceHistoryController::class, 'destroyActivity'])->name('attendance.activities.destroy');

    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::post('/profile/status-izin-sakit', [ProfileController::class, 'updateLeaveStatus'])->name('profile.status-izin-sakit');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
    Route::delete('/profile/revoke-biometric', [ProfileController::class, 'revokeBiometric'])->name('profile.revoke-biometric');

    // Admin Only Routes
    Route::middleware('admin')->group(function () {
        // Admin Enrollment
        Route::get('/admin/enroll', [\App\Http\Controllers\Admin\EnrollmentController::class, 'index'])->name('admin.enroll');
        Route::post('/admin/enroll', [\App\Http\Controllers\Admin\EnrollmentController::class, 'store'])->name('admin.enroll.store');

        // Admin Teachers Management
        Route::resource('admin/teachers', \App\Http\Controllers\Admin\TeacherController::class)->names('admin.teachers');
        Route::post('admin/teachers/{teacher}/restore', [\App\Http\Controllers\Admin\TeacherController::class, 'restore'])->name('admin.teachers.restore');

        // Researcher Settings
        Route::get('/admin/settings', [\App\Http\Controllers\SettingsController::class, 'index'])->name('admin.settings');
        Route::post('/admin/settings', [\App\Http\Controllers\SettingsController::class, 'update'])->name('admin.settings.update');

        // Model Settings (FaceNet & EMAR Calibration - Qalwani Anugerah)
        Route::get('/admin/settings/model', [\App\Http\Controllers\Admin\ModelSettingController::class, 'index'])->name('admin.settings.model');
        Route::post('/admin/settings/model', [\App\Http\Controllers\Admin\ModelSettingController::class, 'update'])->name('admin.settings.model.update');
        Route::post('/admin/settings/model/reset', [\App\Http\Controllers\Admin\ModelSettingController::class, 'reset'])->name('admin.settings.model.reset');

        // Research Dataset Qalwani
        Route::get('/admin/research-dataset', [\App\Http\Controllers\Admin\ResearchDatasetController::class, 'index'])->name('admin.research-dataset');
        Route::post('/admin/research-dataset', [\App\Http\Controllers\Admin\ResearchDatasetController::class, 'store'])->name('admin.research-dataset.store');
        Route::delete('/admin/research-dataset/sample/{id?}', [\App\Http\Controllers\Admin\ResearchDatasetController::class, 'destroySample'])->name('admin.research-dataset.destroy-sample');
        Route::delete('/admin/research-dataset/reset', [\App\Http\Controllers\Admin\ResearchDatasetController::class, 'destroyAll'])->name('admin.research-dataset.destroy-all');
        Route::get('/admin/research-dataset/download-manifest', [\App\Http\Controllers\Admin\ResearchDatasetController::class, 'downloadManifest'])->name('admin.research-dataset.download-manifest');
    });
});

require __DIR__.'/auth.php';
