<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\AttendanceRecord;
use Illuminate\Support\Facades\Response;

class ExportController extends Controller
{
    public function operational(Request $request)
    {
        if (auth()->user()->role === 'teacher') {
            abort(403, 'Unauthorized');
        }

        $records = AttendanceRecord::with('user')->orderBy('created_at', 'desc')->get();
        $csvData = "ID,Tanggal,Nama Guru,Email,Status,Alasan Keputusan\n";
        
        foreach ($records as $record) {
            $name = $record->user ? $record->user->name : 'Unknown';
            $email = $record->user ? $record->user->email : 'Unknown';
            $csvData .= "{$record->id},{$record->created_at},\"{$name}\",\"{$email}\",{$record->status},\"{$record->decision_reason}\"\n";
        }

        return Response::make($csvData, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="export_operasional.csv"',
        ]);
    }

    public function research(Request $request)
    {
        if (auth()->user()->role !== 'researcher') {
            abort(403, 'Hanya peneliti yang dapat mengakses laporan ini');
        }

        $records = AttendanceRecord::orderBy('created_at', 'desc')->get();
        $csvData = "Record_ID,Tanggal,Pseudo_User_ID,Status,Alasan_Keputusan,FaceNet_Score,EMAR_Score\n";
        
        foreach ($records as $record) {
            // Create pseudo ID from user ID
            $pseudoId = $record->user_id ? hash('crc32', 'user_'.$record->user_id) : 'Unknown';
            
            $metadata = $record->metadata ?? [];
            $fnScore = $metadata['facenet_score'] ?? 'N/A';
            $emarScore = $metadata['emar_score'] ?? 'N/A';
            
            $csvData .= "{$record->id},{$record->created_at},{$pseudoId},{$record->status},\"{$record->decision_reason}\",{$fnScore},{$emarScore}\n";
        }

        return Response::make($csvData, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="export_penelitian.csv"',
        ]);
    }

    public function cochran(Request $request)
    {
        return \App\Services\CochranExportService::streamCsvResponse();
    }
}
